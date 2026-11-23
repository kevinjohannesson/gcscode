import { describe, expect, it, vi } from 'vitest';

import { LiveSession } from './live-session.svelte';
import type { ReportListener, StreamSample, VideoSession } from './video-source';

const sample: StreamSample = {
  connection: 'connected',
  framesDecoded: 1,
  bytesReceived: 2,
  packetsReceived: 3,
  packetsLost: 4,
};

function fakeOpen() {
  const opened: {
    listener: ReportListener;
    session: VideoSession & { close: ReturnType<typeof vi.fn> };
  }[] = [];
  const open = (listener: ReportListener) => {
    const session = { close: vi.fn(), sample: vi.fn(() => Promise.resolve(sample)) };
    opened.push({ listener, session });
    return session;
  };
  return { opened, open };
}

describe('LiveSession', () => {
  it('has no session before anything opens', () => {
    expect(new LiveSession().current).toBeNull();
  });

  it('makes an opened session current and passes the listener through', async () => {
    const live = new LiveSession();
    const fake = fakeOpen();
    const listener = vi.fn();
    const session = live.track(fake.open)(listener);
    expect(live.current).toBe(session);
    expect(fake.opened[0]!.listener).toBe(listener);
    await expect(live.current!.sample()).resolves.toBe(sample);
  });

  it('clears the current session when it is closed, and closes the real one', () => {
    const live = new LiveSession();
    const fake = fakeOpen();
    const session = live.track(fake.open)(() => {});
    session.close();
    expect(live.current).toBeNull();
    expect(fake.opened[0]!.session.close).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer session current when an older one closes late', () => {
    const live = new LiveSession();
    const fake = fakeOpen();
    const open = live.track(fake.open);
    const older = open(() => {});
    const newer = open(() => {});
    older.close();
    expect(live.current).toBe(newer);
    expect(fake.opened[0]!.session.close).toHaveBeenCalledTimes(1);
    expect(fake.opened[1]!.session.close).not.toHaveBeenCalled();
  });
});
