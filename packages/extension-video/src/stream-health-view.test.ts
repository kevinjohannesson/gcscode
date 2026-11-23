import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { liveSession } from './live-session.svelte';
import { HEALTH_POLL_MS } from './stream-health-monitor.svelte';
import StreamHealthView from './stream-health-view.svelte';
import type { StreamSample } from './video-source';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const value = (label: string) => screen.getByTestId(label).textContent;

describe('StreamHealthView', () => {
  it('says there is no connection while the Video panel holds no session', async () => {
    const result = render(StreamHealthView);
    await vi.advanceTimersByTimeAsync(0);
    expect(value('Connection')).toBe('no connection');
    expect(value('Frames per second')).toBe('—');
    expect(value('Since last new frame')).toBe('—');
    expect(value('Bitrate')).toBe('—');
    expect(value('Packet loss')).toBe('—');
    result.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads the Video panel's own session and shows its health", async () => {
    let totals: StreamSample = {
      connection: 'connected',
      framesDecoded: 0,
      bytesReceived: 0,
      packetsReceived: 0,
      packetsLost: 0,
    };
    const session = liveSession.track(() => ({
      close: () => {},
      sample: () => Promise.resolve(totals),
    }))(() => {});

    const result = render(StreamHealthView);
    await vi.advanceTimersByTimeAsync(0);
    totals = {
      connection: 'connected',
      framesDecoded: 15,
      bytesReceived: 125_000,
      packetsReceived: 97,
      packetsLost: 3,
    };
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    expect(value('Connection')).toBe('connected');
    expect(value('Frames per second')).toBe('30.0');
    expect(value('Since last new frame')).toBe('0.0 s');
    expect(value('Bitrate')).toBe('2000 kbit/s');
    expect(value('Packet loss')).toBe('3.0 %');

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS * 3);
    expect(value('Since last new frame')).toBe('1.5 s');

    session.close();
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS);
    expect(value('Connection')).toBe('no connection');
    result.unmount();
  });
});
