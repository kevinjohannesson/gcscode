import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import { liveSession } from './live-session.svelte';
import { FakePeerConnection } from './test-fakes';
import VideoPanel from './video-panel.svelte';

// jsdom has neither RTCPeerConnection nor IntersectionObserver: this is the
// "browser with no WebRTC" case, and mounting must not throw.
describe('VideoPanel', () => {
  it('mounts without WebRTC or IntersectionObserver, says so, and unmounts cleanly', async () => {
    let result!: ReturnType<typeof render>;
    expect(() => {
      result = render(VideoPanel);
    }).not.toThrow();

    await vi.waitFor(() => {
      expect(screen.getByText("This browser can't play this video.")).toBeTruthy();
    });
    expect(result.container.querySelector('video')).not.toBeNull();

    expect(() => result.unmount()).not.toThrow();
  });
});

describe('VideoPanel and the health view', () => {
  it("shares the panel's open session through liveSession, and clears it on unmount", async () => {
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    // The POST never answers, so the session stays open.
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    try {
      const result = render(VideoPanel);
      await vi.waitFor(() => {
        expect(liveSession.current).not.toBeNull();
      });
      expect(FakePeerConnection.instances).toHaveLength(1);
      result.unmount();
      expect(liveSession.current).toBeNull();
    } finally {
      vi.unstubAllGlobals();
      FakePeerConnection.instances = [];
    }
  });
});
