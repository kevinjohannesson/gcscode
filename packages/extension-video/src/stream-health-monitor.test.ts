import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HEALTH_POLL_MS, StreamHealthMonitor } from './stream-health-monitor.svelte';
import type { StreamSample, VideoSession } from './video-source';

function totals(framesDecoded: number): StreamSample {
  return {
    connection: 'connected',
    framesDecoded,
    bytesReceived: framesDecoded * 1000,
    packetsReceived: framesDecoded,
    packetsLost: 0,
  };
}

function fakeSession(read: () => Promise<StreamSample | null>) {
  const sample = vi.fn(read);
  const session: VideoSession = { close: () => {}, sample };
  return { session, sample };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('StreamHealthMonitor', () => {
  it('shows no session while the panel holds none, and keeps checking', async () => {
    const monitor = new StreamHealthMonitor(() => null, Date.now);
    monitor.start();
    await settle();
    expect(monitor.health.connection).toBe('none');
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS * 3);
    expect(monitor.health.connection).toBe('none');
    monitor.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('samples on start and then every poll, and shows a frozen picture within a second', async () => {
    let frames = 0;
    const fake = fakeSession(() => Promise.resolve(totals(frames)));
    const monitor = new StreamHealthMonitor(() => fake.session, Date.now);
    monitor.start();
    await settle();
    expect(fake.sample).toHaveBeenCalledTimes(1);
    frames = 15;
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    expect(monitor.health.framesPerSecond).toBe(30);
    expect(monitor.health.sinceLastFrameMs).toBe(0);
    // The picture freezes: the frame count stops.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.sample).toHaveBeenCalledTimes(4);
    expect(monitor.health.sinceLastFrameMs).toBe(1000);
    expect(monitor.health.framesPerSecond).toBe(0);
    monitor.stop();
  });

  it('starts over when the panel opens a new session', async () => {
    let current = fakeSession(() => Promise.resolve(totals(100)));
    const monitor = new StreamHealthMonitor(() => current.session, Date.now);
    monitor.start();
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    expect(monitor.health.framesPerSecond).toBe(0);
    // The new session's counters begin again at a lower total.
    current = fakeSession(() => Promise.resolve(totals(10)));
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    expect(monitor.health.framesPerSecond).toBeNull();
    expect(monitor.health.sinceLastFrameMs).toBe(0);
    monitor.stop();
  });

  it('shows no session once the session can no longer be read', async () => {
    let readable = true;
    const fake = fakeSession(() => Promise.resolve(readable ? totals(1) : null));
    const monitor = new StreamHealthMonitor(() => fake.session, Date.now);
    monitor.start();
    await settle();
    expect(monitor.health.connection).toBe('connected');
    readable = false;
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    expect(monitor.health.connection).toBe('none');
    monitor.stop();
  });

  it('skips a tick while a sample is still being read', async () => {
    const fake = fakeSession(() => new Promise(() => {}));
    const monitor = new StreamHealthMonitor(() => fake.session, Date.now);
    monitor.start();
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS * 4);
    expect(fake.sample).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  it('survives a session whose sample throws or rejects', async () => {
    let mode: 'throw' | 'reject' = 'throw';
    const fake = fakeSession(() => {
      if (mode === 'throw') throw new Error('sample');
      return Promise.reject(new Error('sample'));
    });
    const monitor = new StreamHealthMonitor(() => fake.session, Date.now);
    expect(() => monitor.start()).not.toThrow();
    await settle();
    mode = 'reject';
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS * 2);
    expect(fake.sample).toHaveBeenCalledTimes(3);
    monitor.stop();
  });

  it('ignores a sample that arrives after stop()', async () => {
    let resolve!: (s: StreamSample) => void;
    const fake = fakeSession(() => new Promise((r) => (resolve = r)));
    const monitor = new StreamHealthMonitor(() => fake.session, Date.now);
    monitor.start();
    monitor.stop();
    resolve(totals(5));
    await settle();
    expect(monitor.health.connection).toBe('none');
  });
});
