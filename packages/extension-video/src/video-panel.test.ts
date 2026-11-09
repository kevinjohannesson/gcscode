import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

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
