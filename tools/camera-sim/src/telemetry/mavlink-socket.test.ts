import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MavlinkSocket, type WebSocketLike } from './mavlink-socket';

class FakeSocket implements WebSocketLike {
  public onopen: ((event: unknown) => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onclose: ((event: unknown) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public closed = false;
  public constructor(public readonly url: string) {}
  public close(): void {
    this.closed = true;
    this.onclose?.({});
  }
}

describe('MavlinkSocket', () => {
  let sockets: FakeSocket[];
  let messages: { json: unknown; at: number }[];
  let states: string[];
  let socket: MavlinkSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    messages = [];
    states = [];
    socket = new MavlinkSocket({
      url: 'ws://sitl/ws',
      onMessage: (json, at) => messages.push({ json, at }),
      onStateChange: (s) => states.push(s),
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      now: () => 42,
    });
  });

  afterEach(() => {
    socket.stop();
    vi.useRealTimers();
  });

  it('connects to the configured URL and reports connected', () => {
    socket.start();
    sockets[0]!.onopen?.({});
    expect(sockets.map((s) => s.url)).toEqual(['ws://sitl/ws']);
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('delivers parsed JSON with its arrival time and skips anything unparseable', () => {
    socket.start();
    sockets[0]!.onmessage?.({ data: '{"message":{"type":"HEARTBEAT"}}' });
    sockets[0]!.onmessage?.({ data: 'not json' });
    expect(messages).toEqual([{ json: { message: { type: 'HEARTBEAT' } }, at: 42 }]);
  });

  it('reconnects after 1 s, then 2 s, and resets the delay once connected', () => {
    socket.start();
    sockets[0]!.onclose?.({});
    expect(states.at(-1)).toBe('disconnected');
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.onclose?.({});
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    sockets[2]!.onopen?.({});
    sockets[2]!.onclose?.({});
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(4);
  });

  it('caps the reconnect delay at 10 s', () => {
    socket.start();
    for (let i = 0; i < 6; i++) {
      sockets.at(-1)!.onclose?.({});
      vi.advanceTimersByTime(10000);
    }
    const before = sockets.length;
    sockets.at(-1)!.onclose?.({});
    vi.advanceTimersByTime(9999);
    expect(sockets).toHaveLength(before);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(before + 1);
  });

  it('ignores an old socket closing late after a stop-then-start, as browsers deliver close asynchronously', () => {
    socket.start();
    const old = sockets[0]!;
    old.close = () => {
      old.closed = true; // no synchronous onclose: the browser fires it later
    };
    socket.stop();
    socket.start();
    sockets[1]!.onopen?.({});
    old.onclose?.({});
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(2);
    expect(socket.state).toBe('connected');
  });

  it('stays down after stop', () => {
    socket.start();
    socket.stop();
    vi.advanceTimersByTime(60000);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.closed).toBe(true);
    expect(states.at(-1)).toBe('stopped');
  });
});
