import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECT_TIMEOUT_MS, RETRY_DELAY_MS, VideoPanelState } from './video-panel-state.svelte';
import type { ReportListener, SessionReport, VideoSession } from './video-source';

const label = 'http://localhost:8889/drone-1/whep';

interface Attempt {
  listener: ReportListener;
  close: ReturnType<typeof vi.fn>;
}

function setup() {
  const attempts: Attempt[] = [];
  const open = vi.fn((listener: ReportListener): VideoSession => {
    const close = vi.fn();
    attempts.push({ listener, close });
    return { close };
  });
  const state = new VideoPanelState(label, open);
  const send = (report: SessionReport, attempt = attempts.length - 1) =>
    attempts[attempt]!.listener(report);
  return { attempts, open, state, send };
}

const fakeStream = {} as MediaStream;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('connecting to playing', () => {
  it('connects, receives a stream, then plays on the first picture', () => {
    const { state, send } = setup();
    state.start();
    expect(state.status).toBe('connecting');
    expect(state.message).toBe('Connecting to video…');
    send({ kind: 'stream', stream: fakeStream });
    expect(state.status).toBe('connecting');
    expect(state.stream).toBe(fakeStream);
    send({ kind: 'picture' });
    expect(state.status).toBe('playing');
    expect(state.message).toBeNull();
  });

  it('a second start() does nothing', () => {
    const { state, open } = setup();
    state.start();
    state.start();
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('connect timeout', () => {
  it('reports no-picture at exactly 15000 ms and closes the session', () => {
    const { state, send, attempts } = setup();
    state.start();
    send({ kind: 'stream', stream: fakeStream });
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1);
    expect(state.status).toBe('connecting');
    vi.advanceTimersByTime(1);
    expect(state.status).toBe('no-picture');
    expect(state.message).toBe('Connected, but no picture arrived. Retrying…');
    expect(attempts[0]!.close).toHaveBeenCalledTimes(1);
    expect(state.stream).toBeNull();
  });

  it('a picture cancels the timeout', () => {
    const { state, send } = setup();
    state.start();
    send({ kind: 'picture' });
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS * 2);
    expect(state.status).toBe('playing');
  });
});

describe('drops', () => {
  it('a drop before any picture is no-picture', () => {
    const { state, send } = setup();
    state.start();
    send({ kind: 'dropped', label });
    expect(state.status).toBe('no-picture');
  });

  it('a drop after a picture is lost', () => {
    const { state, send } = setup();
    state.start();
    send({ kind: 'picture' });
    send({ kind: 'dropped', label });
    expect(state.status).toBe('lost');
    expect(state.message).toBe('Video lost. Reconnecting…');
  });
});

describe('failure text', () => {
  it('unreachable names the address', () => {
    const { state, send } = setup();
    state.start();
    send({ kind: 'unreachable', label });
    expect(state.status).toBe('unreachable');
    expect(state.message).toBe(`Can't reach the video server at ${label}. Retrying…`);
  });

  it('no-stream names the address', () => {
    const { state, send } = setup();
    state.start();
    send({ kind: 'no-stream', label });
    expect(state.status).toBe('no-stream');
    expect(state.message).toBe(`No video at ${label} yet. Retrying…`);
  });

  it('refused shows the detail', () => {
    const { state, send } = setup();
    state.start();
    send({ kind: 'refused', label, detail: '503' });
    expect(state.status).toBe('refused');
    expect(state.message).toBe('The video server refused (503). Retrying…');
  });
});

describe('retry', () => {
  it.each([
    ['unreachable', { kind: 'unreachable', label }],
    ['no-stream', { kind: 'no-stream', label }],
    ['refused', { kind: 'refused', label, detail: '503' }],
    ['dropped', { kind: 'dropped', label }],
  ] as const)('after %s, reopens at exactly 3000 ms', (_name, report) => {
    const { state, send, open } = setup();
    state.start();
    send(report);
    vi.advanceTimersByTime(RETRY_DELAY_MS - 1);
    expect(open).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('retries after the connect timeout', () => {
    const { state, open } = setup();
    state.start();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + RETRY_DELAY_MS);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('does not retry after unsupported', () => {
    const { state, send, open } = setup();
    state.start();
    send({ kind: 'unsupported', label });
    vi.advanceTimersByTime(60000);
    expect(open).toHaveBeenCalledTimes(1);
    expect(state.status).toBe('unsupported');
    expect(state.message).toBe("This browser can't play this video.");
  });

  it('keeps the failure text during the retry and plays on a new picture', () => {
    const { state, send } = setup();
    state.start();
    send({ kind: 'unreachable', label });
    const text = state.message;
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(state.status).toBe('unreachable');
    expect(state.message).toBe(text);
    send({ kind: 'picture' });
    expect(state.status).toBe('playing');
    expect(state.message).toBeNull();
  });
});

describe('stale reports', () => {
  it('ignores a report from a superseded attempt', () => {
    const { state, send } = setup();
    state.start();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS + RETRY_DELAY_MS);
    expect(state.status).toBe('no-picture');
    send({ kind: 'picture' }, 0);
    expect(state.status).toBe('no-picture');
    expect(state.message).toBe('Connected, but no picture arrived. Retrying…');
  });

  it('ignores a second failure from an attempt already failed', () => {
    const { state, send, open } = setup();
    state.start();
    send({ kind: 'unreachable', label });
    send({ kind: 'refused', label, detail: '500' });
    expect(state.status).toBe('unreachable');
    vi.advanceTimersByTime(RETRY_DELAY_MS * 5);
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('stop', () => {
  it('closes the session, clears timers and opens nothing more', () => {
    const { state, attempts, open } = setup();
    state.start();
    state.stop();
    expect(attempts[0]!.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(open).toHaveBeenCalledTimes(1);
    state.stop();
    expect(attempts[0]!.close).toHaveBeenCalledTimes(1);
  });

  it('clears the retry timer when stopped between attempts', () => {
    const { state, send, open } = setup();
    state.start();
    send({ kind: 'unreachable', label });
    state.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('ignores reports after stop', () => {
    const { state, send } = setup();
    state.start();
    state.stop();
    send({ kind: 'picture' });
    expect(state.status).toBe('connecting');
  });

  it('does not start after stop', () => {
    const { state, open } = setup();
    state.stop();
    state.start();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('open throws', () => {
  it('shows unsupported and nothing escapes start()', () => {
    const open = vi.fn(() => {
      throw new Error('no webrtc');
    });
    const state = new VideoPanelState(label, open);
    expect(() => state.start()).not.toThrow();
    expect(state.status).toBe('unsupported');
    expect(state.message).toBe("This browser can't play this video.");
    vi.advanceTimersByTime(60000);
    expect(open).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('a report before open() returns', () => {
  it('handles the failure and closes the session open() then returns', () => {
    const close = vi.fn();
    const open = vi.fn((listener: ReportListener): VideoSession => {
      listener({ kind: 'unreachable', label });
      return { close };
    });
    const state = new VideoPanelState(label, open);
    state.start();
    expect(state.status).toBe('unreachable');
    expect(close).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RETRY_DELAY_MS);
    expect(open).toHaveBeenCalledTimes(2);
    state.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
