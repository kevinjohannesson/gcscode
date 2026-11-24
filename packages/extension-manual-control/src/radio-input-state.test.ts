import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RadioInputState, RETRY_DELAY_MS, SILENCE_LIMIT_MS } from './radio-input-state.svelte';
import { FakeSocket, HELLO, inputText } from './test-fakes';

const URL = 'ws://127.0.0.1:8091/ws';

function started() {
  const state = new RadioInputState(URL, (url) => new FakeSocket(url));
  state.start();
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RadioInputState', () => {
  it('opens one socket to the station address on start, and only one', () => {
    const state = started();
    state.start();
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.latest().url).toBe(URL);
    expect(state.status).toBe('connecting');
  });

  it('is live after hello and shows the newest input', () => {
    const state = started();
    const socket = FakeSocket.latest();
    socket.receive(HELLO);
    expect(state.status).toBe('live');
    expect(state.radio).toBeNull();

    socket.receive(inputText([100, -32768], [false, true], 12));
    expect(state.radio?.axes).toEqual([100, -32768]);
    expect(state.radio?.buttons).toEqual([false, true]);
    expect(state.eventsPerSecond).toBe(12);

    socket.receive(inputText([5, 0], [true, false], null));
    expect(state.radio?.axes).toEqual([5, 0]);
    expect(state.eventsPerSecond).toBeNull();
  });

  it('ignores input that comes before hello, and text it does not understand', () => {
    const state = started();
    const socket = FakeSocket.latest();
    socket.receive(inputText([1], [true]));
    expect(state.radio).toBeNull();
    socket.receive(HELLO);
    socket.receive(inputText([1], [true]));
    socket.receive('garbage');
    expect(state.radio?.axes).toEqual([1]);
    expect(state.status).toBe('live');
  });

  it('says a station with another protocol does not match, and keeps trying', () => {
    const state = started();
    const first = FakeSocket.latest();
    first.receive('{"type":"hello","protocol":1,"station":"0.2.0"}');
    expect(state.status).toBe('mismatch');
    expect(state.stationProtocol).toBe(1);
    expect(first.closeCalls).toBe(1);

    // Input on the refused socket is not shown.
    first.receive(inputText([9], [true]));
    expect(state.radio).toBeNull();

    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(state.status).toBe('mismatch');
    FakeSocket.latest().receive(HELLO);
    expect(state.status).toBe('live');
    expect(state.stationProtocol).toBeNull();
  });

  it('when the station goes, clears the radio and tries again after two seconds', () => {
    const state = started();
    const first = FakeSocket.latest();
    first.receive(HELLO);
    first.receive(inputText([1], [true]));
    first.closeFromStation();
    expect(state.status).toBe('unreachable');
    expect(state.radio).toBeNull();
    expect(state.eventsPerSecond).toBeNull();
    // A late message from the closed socket is not shown.
    first.receive(inputText([3], [true]));
    expect(state.radio).toBeNull();

    vi.advanceTimersByTime(RETRY_DELAY_MS - 1);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2);

    // A late message from the old socket changes nothing.
    first.receive(inputText([7], [false]));
    expect(state.radio).toBeNull();

    const second = FakeSocket.latest();
    second.receive(HELLO);
    expect(state.status).toBe('live');

    // A late close from the old socket does not drop the new one.
    first.closeFromStation();
    expect(state.status).toBe('live');
    expect(second.closeCalls).toBe(0);
  });

  it('treats three seconds of silence as a lost station', () => {
    const state = started();
    const socket = FakeSocket.latest();
    socket.receive(HELLO);
    vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1);
    socket.receive(inputText([1], [true]));
    vi.advanceTimersByTime(SILENCE_LIMIT_MS - 1);
    expect(state.status).toBe('live');
    vi.advanceTimersByTime(1);
    expect(state.status).toBe('unreachable');
    expect(socket.closeCalls).toBe(1);
  });

  it('tries again when the socket cannot even be created', () => {
    let calls = 0;
    const state = new RadioInputState(URL, (url) => {
      calls++;
      if (calls === 1) throw new SyntaxError('bad url');
      return new FakeSocket(url);
    });
    state.start();
    expect(state.status).toBe('unreachable');
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(calls).toBe(2);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('stop closes the socket and stops trying', () => {
    const state = started();
    const socket = FakeSocket.latest();
    socket.receive(HELLO);
    state.stop();
    expect(socket.closeCalls).toBe(1);
    vi.advanceTimersByTime(SILENCE_LIMIT_MS + RETRY_DELAY_MS * 3);
    expect(FakeSocket.instances).toHaveLength(1);
    state.start();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('stop during a retry wait cancels the retry', () => {
    const state = started();
    FakeSocket.latest().closeFromStation();
    state.stop();
    vi.advanceTimersByTime(RETRY_DELAY_MS * 3);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
