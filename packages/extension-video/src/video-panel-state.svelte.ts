import type { OpenVideoSession, SessionReport, VideoSession } from './video-source';

export const CONNECT_TIMEOUT_MS = 15000;
export const RETRY_DELAY_MS = 3000;

export type PanelStatus =
  | 'connecting'
  | 'playing'
  | 'unreachable'
  | 'no-stream'
  | 'refused'
  | 'no-picture'
  | 'lost'
  | 'unsupported';

type Failure = Exclude<PanelStatus, 'connecting' | 'playing'>;

/**
 * Turns a video session's reports into what the operator sees: one session at
 * a time, a connect timeout, a fixed retry, and the operator text. A report
 * from an attempt that already ended is ignored.
 */
export class VideoPanelState {
  private _status = $state<PanelStatus>('connecting');
  private _message = $state<string | null>('Connecting to video…');
  private _stream = $state.raw<MediaStream | null>(null);

  private readonly label: string;
  private readonly open: OpenVideoSession;
  private started = false;
  private stopped = false;
  // Id of the attempt whose reports are accepted; null between attempts.
  private liveAttempt: number | null = null;
  private attemptCount = 0;
  private session: VideoSession | null = null;
  private pictureSeen = false;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(label: string, open: OpenVideoSession) {
    this.label = label;
    this.open = open;
  }

  public get status(): PanelStatus {
    return this._status;
  }
  public get message(): string | null {
    return this._message;
  }
  public get stream(): MediaStream | null {
    return this._stream;
  }

  public start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.attempt();
  }

  public stop(): void {
    this.stopped = true;
    this.liveAttempt = null;
    this.clearTimers();
    this.closeSession();
  }

  private attempt(): void {
    this.retryTimer = null;
    const id = ++this.attemptCount;
    this.liveAttempt = id;
    this.pictureSeen = false;
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      this.fail(id, 'no-picture');
    }, CONNECT_TIMEOUT_MS);
    let session: VideoSession;
    try {
      session = this.open((report) => this.onReport(id, report));
    } catch {
      this.fail(id, 'unsupported');
      return;
    }
    // A failure may already have ended this attempt before open() returned.
    if (this.liveAttempt === id) this.session = session;
    else session.close();
  }

  private onReport(id: number, report: SessionReport): void {
    if (id !== this.liveAttempt) return;
    switch (report.kind) {
      case 'stream':
        this._stream = report.stream;
        return;
      case 'picture':
        this.pictureSeen = true;
        this.clearTimeout();
        this._status = 'playing';
        this._message = null;
        return;
      case 'dropped':
        this.fail(id, this.pictureSeen ? 'lost' : 'no-picture');
        return;
      case 'refused':
        this.fail(id, 'refused', report.detail);
        return;
      default:
        this.fail(id, report.kind);
    }
  }

  private fail(id: number, failure: Failure, detail?: string): void {
    if (id !== this.liveAttempt) return;
    this.liveAttempt = null;
    this.clearTimeout();
    this.closeSession();
    this._stream = null;
    this._status = failure;
    this._message = this.textFor(failure, detail);
    if (failure !== 'unsupported' && !this.stopped) {
      this.retryTimer = setTimeout(() => this.attempt(), RETRY_DELAY_MS);
    }
  }

  private textFor(failure: Failure, detail?: string): string {
    switch (failure) {
      case 'unreachable':
        return `Can't reach the video server at ${this.label}. Retrying…`;
      case 'no-stream':
        return `No video at ${this.label} yet. Retrying…`;
      case 'refused':
        return `The video server refused (${detail ?? 'unknown'}). Retrying…`;
      case 'no-picture':
        return 'Connected, but no picture arrived. Retrying…';
      case 'lost':
        return 'Video lost. Reconnecting…';
      case 'unsupported':
        return "This browser can't play this video.";
    }
  }

  private closeSession(): void {
    const session = this.session;
    this.session = null;
    try {
      session?.close();
    } catch {
      // close() must not throw; a misbehaving session must not break the panel.
    }
  }

  private clearTimeout(): void {
    if (this.timeoutTimer !== null) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
  }

  private clearTimers(): void {
    this.clearTimeout();
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
