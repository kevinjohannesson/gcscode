// Whether the station process (packages/mavlink-station, ADR-0016) is running,
// as the Link state view shows it. ADR-0016 makes the station this extension's
// native half, so this extension owns its address and the session to it
// (ADR-0015 Decision 3). It only listens: protocol 1 has nothing for a page to
// send, and it never sends.

/** The station protocol this page speaks (packages/mavlink-station/README.md). */
export const STATION_PROTOCOL = 1;
export const DEFAULT_STATION_URL = 'ws://127.0.0.1:8091/ws';

/** How long after losing the station it tries again. */
export const RETRY_DELAY_MS = 2000;
/**
 * The station sends at least once a second, so this long without a message
 * means it is gone even if the socket has not said so.
 */
export const SILENCE_LIMIT_MS = 3000;

/**
 * `running`: it said hello in this page's protocol and keeps talking.
 * `mismatch`: it answers, in another protocol, which counts as unreachable (ADR-0015 Decision 4).
 * `not-running`: nothing answers at the address, or it went quiet.
 */
export type StationStatus = 'connecting' | 'running' | 'not-running' | 'mismatch';

/** The part of a browser WebSocket this uses, so tests can stand in for it. */
export interface StationSocket {
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  close(): void;
}

export type OpenStationSocket = (url: string) => StationSocket;

/** The station's `hello`, or null when `text` is not one. */
export function parseHello(text: string): { protocol: number; station: string } | null {
  const m = parseObject(text);
  if (m?.['type'] !== 'hello') return null;
  const { protocol, station } = m;
  if (typeof protocol !== 'number' || !Number.isInteger(protocol)) return null;
  if (typeof station !== 'string') return null;
  return { protocol, station };
}

function parseObject(text: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * One socket to the station at a time, a retry every two seconds after it
 * goes, and since when the station has been in its current state. It stores
 * times, not ages, as the link state does, so the view's ages keep growing.
 */
export class StationLink {
  private _status = $state<StationStatus>('connecting');
  private _since = $state(0);
  private _url = $state(DEFAULT_STATION_URL);
  /** The version a running station gave in its hello. */
  private _version = $state<string | null>(null);
  /** The protocol a mismatched station speaks. */
  private _stationProtocol = $state<number | null>(null);

  private readonly openSocket: OpenStationSocket;
  private readonly now: () => number;
  private socket: StationSocket | null = null;
  private greeted = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(openSocket: OpenStationSocket, now: () => number = () => Date.now()) {
    this.openSocket = openSocket;
    this.now = now;
    this._since = now();
  }

  public get status(): StationStatus {
    return this._status;
  }
  /** When the station entered its current status. */
  public get since(): number {
    return this._since;
  }
  public get url(): string {
    return this._url;
  }
  public get version(): string | null {
    return this._version;
  }
  public get stationProtocol(): number | null {
    return this._stationProtocol;
  }

  /** Starts watching the station at `url`, after stopping any earlier watch. */
  public start(url: string): void {
    this.stop();
    this._url = url;
    this.connect();
  }

  /** Stops watching and forgets what it knew. */
  public stop(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.drop();
    this._version = null;
    this._stationProtocol = null;
    this.setStatus('connecting');
  }

  private connect(): void {
    this.retryTimer = null;
    this.greeted = false;
    let socket: StationSocket;
    try {
      socket = this.openSocket(this._url);
    } catch {
      this.lost();
      return;
    }
    this.socket = socket;
    // drop() detaches these, so an old socket's late events never arrive here.
    // A socket that fails also closes, which is where that is handled.
    socket.onmessage = (event) => this.onMessage(event.data);
    socket.onclose = () => this.lost();
    this.watchSilence();
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    if (!this.greeted) {
      const hello = parseHello(data);
      if (!hello) return;
      if (hello.protocol !== STATION_PROTOCOL) {
        this._stationProtocol = hello.protocol;
        this._version = hello.station;
        this.setStatus('mismatch');
        this.retry();
        return;
      }
      this.greeted = true;
      this._stationProtocol = null;
      this._version = hello.station;
      this.setStatus('running');
      this.watchSilence();
      return;
    }
    // After the hello, any message of the protocol's shape shows it is still there.
    if (typeof parseObject(data)?.['type'] === 'string') this.watchSilence();
  }

  private watchSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      this.silenceTimer = null;
      this.lost();
    }, SILENCE_LIMIT_MS);
  }

  /** The socket closed or went quiet without a usable hello: nothing is running there. */
  private lost(): void {
    this._version = null;
    this._stationProtocol = null;
    this.setStatus('not-running');
    this.retry();
  }

  private retry(): void {
    this.drop();
    this.retryTimer = setTimeout(() => this.connect(), RETRY_DELAY_MS);
  }

  private setStatus(status: StationStatus): void {
    if (status === this._status) return;
    this._status = status;
    this._since = this.now();
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

/** The extension's one station link; `activate()` starts it and its subscriptions stop it. */
export const stationLink = new StationLink((url) => new WebSocket(url));
