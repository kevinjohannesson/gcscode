import { advance, NO_SESSION, type HealthMemory, type StreamHealth } from './stream-health';
import type { VideoSession } from './video-source';

/** How often the health view samples the session: often enough that a frozen picture shows within a second. */
export const HEALTH_POLL_MS = 500;

/**
 * Samples whichever session `source` returns, every `HEALTH_POLL_MS`, and holds
 * the latest health. A new session starts from scratch; a sample still being
 * read when the next tick comes skips that tick.
 */
export class StreamHealthMonitor {
  private _health = $state<StreamHealth>(NO_SESSION);

  private readonly source: () => VideoSession | null;
  private readonly now: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending = false;
  private session: VideoSession | null = null;
  private memory: HealthMemory | undefined;

  public constructor(source: () => VideoSession | null, now: () => number = () => Date.now()) {
    this.source = source;
    this.now = now;
  }

  public get health(): StreamHealth {
    return this._health;
  }

  public start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), HEALTH_POLL_MS);
    this.tick();
  }

  public stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.pending) return;
    const session = this.source();
    if (session !== this.session) {
      this.session = session;
      this.memory = undefined;
    }
    if (session === null) {
      this._health = NO_SESSION;
      return;
    }
    this.pending = true;
    let reading: Promise<unknown>;
    try {
      reading = session.sample().then((sample) => {
        if (this.timer === null || session !== this.session) return;
        if (sample === null) {
          this._health = NO_SESSION;
          return;
        }
        const next = advance(this.memory, { at: this.now(), sample });
        this.memory = next.memory;
        this._health = next.health;
      });
    } catch {
      reading = Promise.resolve();
    }
    reading
      .catch(() => {})
      .then(() => {
        this.pending = false;
      });
  }
}
