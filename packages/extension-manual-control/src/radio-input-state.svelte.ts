import { PROTOCOL, parseStationMessage, type Controls, type RadioInput } from './station-protocol';

/** How long after losing the station the view tries again. */
export const RETRY_DELAY_MS = 2000;
/**
 * The station sends at least once a second, so this long without a message
 * means it is gone even if the socket has not said so.
 */
export const SILENCE_LIMIT_MS = 3000;

export type StationStatus = 'connecting' | 'live' | 'unreachable' | 'mismatch';

/** The part of a browser WebSocket this view uses, so tests can stand in for it. */
export interface StationSocket {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type OpenStationSocket = (url: string) => StationSocket;

/**
 * The station connection behind the Radio input and Controls views: one socket at a time,
 * a retry every two seconds after it goes, and the newest input it sent.
 * It only listens; nothing it does reaches the station's other pages or the radio.
 */
export class RadioInputState {
  private _status = $state<StationStatus>('connecting');
  private _radio = $state.raw<RadioInput | null>(null);
  private _controls = $state.raw<Controls | null>(null);
  private _eventsPerSecond = $state<number | null>(null);
  private _stationProtocol = $state<number | null>(null);

  private readonly url: string;
  private readonly openSocket: OpenStationSocket;
  private socket: StationSocket | null = null;
  private greeted = false;
  private started = false;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(url: string, openSocket: OpenStationSocket) {
    this.url = url;
    this.openSocket = openSocket;
  }

  public get status(): StationStatus {
    return this._status;
  }
  /** The radio the station has open, or null when it has none, or none is known. */
  public get radio(): RadioInput | null {
    return this._radio;
  }
  /** The radio's input through its profile, or null when no profile is for it. */
  public get controls(): Controls | null {
    return this._controls;
  }
  public get eventsPerSecond(): number | null {
    return this._eventsPerSecond;
  }
  /** The protocol a mismatched station speaks. */
  public get stationProtocol(): number | null {
    return this._stationProtocol;
  }

  public start(): void {
    if (this.started || this.stopped) return;
    this.started = true;
    this.connect();
  }

  public stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.drop();
  }

  private connect(): void {
    this.retryTimer = null;
    this.greeted = false;
    let socket: StationSocket;
    try {
      socket = this.openSocket(this.url);
    } catch {
      this.lost();
      return;
    }
    this.socket = socket;
    // drop() detaches these, so an old socket's late events never arrive here.
    socket.onmessage = (event) => this.onMessage(event.data);
    socket.onclose = () => this.lost();
    // A failed socket also closes, which is where it is handled.
    socket.onerror = null;
    socket.onopen = null;
    this.watchSilence();
  }

  private onMessage(data: unknown): void {
    this.watchSilence();
    const message = typeof data === 'string' ? parseStationMessage(data) : null;
    if (!message) return;
    if (message.type === 'hello') {
      if (message.protocol !== PROTOCOL) {
        this._stationProtocol = message.protocol;
        this._status = 'mismatch';
        this.lost();
        return;
      }
      this.greeted = true;
      this._stationProtocol = null;
      this._status = 'live';
      return;
    }
    if (!this.greeted) return;
    this._radio = message.radio;
    this._controls = message.controls;
    this._eventsPerSecond = message.eventsPerSecond;
  }

  private watchSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.lost();
    }, SILENCE_LIMIT_MS);
  }

  /** The socket is gone or no use: forget what it said and try again shortly. */
  private lost(): void {
    this.drop();
    if (this._status !== 'mismatch') this._status = 'unreachable';
    this._radio = null;
    this._controls = null;
    this._eventsPerSecond = null;
    this.retryTimer = setTimeout(() => this.connect(), RETRY_DELAY_MS);
  }

  private drop(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onmessage = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }
}
