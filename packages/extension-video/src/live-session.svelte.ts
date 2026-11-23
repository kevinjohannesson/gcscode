import type { OpenVideoSession, StreamSample, VideoSession } from './video-source';

/**
 * The session the Video panel holds right now, so the health view can read the
 * panel's own connection instead of opening a second one. The shell renders a
 * view bare, with no props, so module state is how the two views meet, as in
 * `video-address.ts`.
 */
export class LiveSession {
  private _current = $state.raw<VideoSession | null>(null);

  /** The panel's open session, or null between attempts. */
  public get current(): VideoSession | null {
    return this._current;
  }

  /** Wraps `open` so each session it opens is current until it is closed. */
  public track(open: OpenVideoSession): OpenVideoSession {
    return (listener) => {
      const inner = open(listener);
      const session: VideoSession = {
        close: () => {
          if (this._current === session) this._current = null;
          inner.close();
        },
        sample: (): Promise<StreamSample | null> => inner.sample(),
      };
      this._current = session;
      return session;
    };
  }
}

export const liveSession = new LiveSession();
