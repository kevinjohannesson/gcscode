import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createMavlinkClient } from './mavlink-client';

// ---------------------------------------------------------------------------
// MockWebSocket — minimal browser WebSocket interface for tests.
// Tests drive lifecycle manually via _fire* helpers.
// ---------------------------------------------------------------------------

// Registry of constructed mocks. Cleared in beforeEach. We use push(this)
// rather than a direct assignment to avoid the no-this-alias ESLint rule.
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
    // do NOT auto-fire close — tests drive lifecycle manually
  }

  // Test helpers (not part of WebSocket API):
  _fireOpen() {
    this.readyState = 1;
    this.onopen?.({ type: 'open' });
  }

  _fireMessage(data: string) {
    this.onmessage?.({ data });
  }

  _fireError() {
    this.onerror?.({ type: 'error' });
  }

  _fireClose() {
    this.readyState = 3;
    this.onclose?.({ type: 'close' });
  }
}

// Returns the most recently constructed mock for the current test.
function lastMock(): MockWebSocket {
  const mock = mockInstances[mockInstances.length - 1];
  if (!mock) throw new Error('No MockWebSocket instance was constructed');
  return mock;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mavlink-client', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs WebSocket with the exact URL passed; onConnectionStateChange fires connecting synchronously', () => {
    const states: string[] = [];
    const testUrl = 'ws://localhost:8088/v1/ws/mavlink?filter=test';

    createMavlinkClient({
      url: testUrl,
      onMessage: () => {},
      onConnectionStateChange: (s) => states.push(s),
    });

    expect(mockInstances).toHaveLength(1);
    expect(lastMock().url).toBe(testUrl);
    // 'connecting' must fire synchronously (before the function returns)
    expect(states).toEqual(['connecting']);
  });

  it('open event fires onConnectionStateChange connected', () => {
    const states: string[] = [];

    createMavlinkClient({
      url: 'ws://localhost:8088/test',
      onMessage: () => {},
      onConnectionStateChange: (s) => states.push(s),
    });

    lastMock()._fireOpen();

    expect(states).toEqual(['connecting', 'connected']);
  });

  it('message event with valid JSON calls onMessage with parsed object', () => {
    const messages: unknown[] = [];

    createMavlinkClient({
      url: 'ws://localhost:8088/test',
      onMessage: (json) => messages.push(json),
      onConnectionStateChange: () => {},
    });

    lastMock()._fireMessage('{"message":{"type":"HEARTBEAT"}}');

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ message: { type: 'HEARTBEAT' } });
  });

  it('message event with invalid JSON calls console.warn and does NOT call onMessage', () => {
    const messages: unknown[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      createMavlinkClient({
        url: 'ws://localhost:8088/test',
        onMessage: (json) => messages.push(json),
        onConnectionStateChange: () => {},
      });

      lastMock()._fireMessage('not json');

      expect(warnSpy).toHaveBeenCalledOnce();
      expect(messages).toHaveLength(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('close event fires onConnectionStateChange disconnected', () => {
    const states: string[] = [];

    createMavlinkClient({
      url: 'ws://localhost:8088/test',
      onMessage: () => {},
      onConnectionStateChange: (s) => states.push(s),
    });

    lastMock()._fireClose();

    expect(states).toContain('disconnected');
  });

  it('close() returns a promise that resolves when the WebSocket close event fires; idempotent — second call returns same promise; socket.close called once', async () => {
    const client = createMavlinkClient({
      url: 'ws://localhost:8088/test',
      onMessage: () => {},
      onConnectionStateChange: () => {},
    });

    const mock = lastMock();
    const p1 = client.close();
    const p2 = client.close();

    // Should be the same promise (idempotent)
    expect(p1).toBe(p2);

    // socket.close should have been called exactly once
    expect(mock.closeArgs).not.toBeNull();
    expect(mock.closeArgs!.code).toBe(1000);
    expect(mock.closeArgs!.reason).toBe('extension-deactivate');

    // Promise should not yet be resolved (close event hasn't fired)
    let resolved = false;
    p1.then(() => {
      resolved = true;
    });

    // Give any microtasks a chance to run — promise should still be pending
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Now fire the close event — promise should resolve
    mock._fireClose();
    await p1;
    expect(resolved).toBe(true);

    // Calling close() again after resolution returns an already-resolved promise
    const p3 = client.close();
    await expect(p3).resolves.toBeUndefined();
  });

  it('close() after a natural WebSocket close returns an already-resolved promise', async () => {
    const client = createMavlinkClient({
      url: 'ws://localhost:8088/test',
      onMessage: () => {},
      onConnectionStateChange: () => {},
    });

    const mock = lastMock();

    // Natural close fires before consumer calls close()
    mock._fireClose();

    // Now calling close() should return an already-resolved promise
    const p = client.close();
    await expect(p).resolves.toBeUndefined();

    // socket.close should NOT have been called (already closed)
    expect(mock.closeArgs).toBeNull();
  });

  it('error event calls console.error', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      createMavlinkClient({
        url: 'ws://localhost:8088/test',
        onMessage: () => {},
        onConnectionStateChange: () => {},
      });

      lastMock()._fireError();

      expect(errorSpy).toHaveBeenCalledOnce();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
