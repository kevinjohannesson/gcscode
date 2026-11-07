export type SocketState = 'connecting' | 'connected' | 'disconnected' | 'stopped';

/** The parts of a browser WebSocket this class uses, so tests can supply a fake. */
export interface WebSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export interface MavlinkSocketOptions {
  readonly url: string;
  readonly onMessage: (json: unknown, receivedAtMs: number) => void;
  readonly onStateChange?: (state: SocketState) => void;
  readonly createSocket?: (url: string) => WebSocketLike;
  readonly now?: () => number;
}

export const RECONNECT_INITIAL_MS = 1000;
export const RECONNECT_MAX_MS = 10000;

/**
 * A mavlink2rest WebSocket that reconnects on its own. SITL gets restarted
 * all the time; the sim should pick it back up without a page reload.
 */
export class MavlinkSocket {
  private readonly _options: MavlinkSocketOptions;
  private readonly _createSocket: (url: string) => WebSocketLike;
  private readonly _now: () => number;
  private _socket: WebSocketLike | undefined;
  private _retryTimer: ReturnType<typeof setTimeout> | undefined;
  private _retryDelayMs = RECONNECT_INITIAL_MS;
  private _state: SocketState = 'stopped';
  private _running = false;

  public constructor(options: MavlinkSocketOptions) {
    this._options = options;
    this._createSocket =
      options.createSocket ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
    this._now = options.now ?? (() => performance.now());
  }

  public get state(): SocketState {
    return this._state;
  }

  public start(): void {
    if (this._running) return;
    this._running = true;
    this._connect();
  }

  public stop(): void {
    this._running = false;
    clearTimeout(this._retryTimer);
    this._retryTimer = undefined;
    const socket = this._socket;
    this._socket = undefined;
    socket?.close();
    this._setState('stopped');
  }

  private _connect(): void {
    this._setState('connecting');
    const socket = this._createSocket(this._options.url);
    this._socket = socket;
    socket.onopen = () => {
      this._retryDelayMs = RECONNECT_INITIAL_MS;
      this._setState('connected');
    };
    socket.onmessage = (event) => {
      let json: unknown;
      try {
        json = JSON.parse(String(event.data));
      } catch {
        return; // mavlink2rest only sends JSON; anything else is noise.
      }
      this._options.onMessage(json, this._now());
    };
    // A browser fires close after error, so reconnecting happens in onclose.
    socket.onerror = () => {};
    socket.onclose = () => {
      // A browser delivers close asynchronously: after stop(), or after a
      // stop-then-start, an old socket's close must not touch the current one.
      if (this._socket !== socket) return;
      this._socket = undefined;
      this._setState('disconnected');
      this._retryTimer = setTimeout(() => this._connect(), this._retryDelayMs);
      this._retryDelayMs = Math.min(this._retryDelayMs * 2, RECONNECT_MAX_MS);
    };
  }

  private _setState(state: SocketState): void {
    if (state === this._state) return;
    this._state = state;
    this._options.onStateChange?.(state);
  }
}
