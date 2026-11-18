/**
 * Publishes a MediaStream to a WHIP endpoint (MediaMTX: `<media>/<stream>/whip`).
 *
 * WHIP is one HTTP exchange: POST an SDP offer, get an SDP answer and a
 * resource URL back; DELETE that URL to stop. ICE candidates are gathered
 * before the POST, which is enough on a LAN and keeps the client simple.
 *
 * A publisher ends its old session before it posts again: a retry closes its
 * peer but keeps the old session's address, and the next attempt DELETEs it
 * right before its POST, posting only once that is answered. MediaMTX keeps a
 * stream with its first publisher and closes a second one's session just after
 * it connects; a publisher that sees this says `taken` and stops.
 *
 * H.264 only: MediaMTX can re-serve H.264 as RTSP to every reader, and it is
 * what real camera payloads send.
 */

export type PublisherState =
  | 'idle'
  | 'connecting'
  | 'publishing'
  | 'retrying'
  | 'taken'
  | 'stopped';

/** The parts of RTCDtlsTransport this class uses: it closes when MediaMTX ends the session. */
export interface DtlsTransportLike {
  readonly state: RTCDtlsTransportState;
  addEventListener(type: 'statechange', listener: () => void): void;
  removeEventListener(type: 'statechange', listener: () => void): void;
}

/** The parts of RTCPeerConnection this class uses, so tests can supply a fake. */
export interface PeerConnectionLike {
  addTransceiver(
    track: MediaStreamTrack,
    init: RTCRtpTransceiverInit,
  ): { setCodecPreferences(codecs: RTCRtpCodec[]): void };
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  getSenders(): readonly { readonly transport: DtlsTransportLike | null }[];
  readonly localDescription: { readonly sdp: string } | null;
  readonly iceGatheringState: RTCIceGatheringState;
  readonly connectionState: RTCPeerConnectionState;
  addEventListener(
    type: 'icegatheringstatechange' | 'connectionstatechange',
    listener: () => void,
  ): void;
  removeEventListener(
    type: 'icegatheringstatechange' | 'connectionstatechange',
    listener: () => void,
  ): void;
  close(): void;
}

export interface WhipPublisherOptions {
  readonly endpointUrl: string;
  readonly tracks: readonly MediaStreamTrack[];
  readonly onStateChange?: (state: PublisherState, detail?: string) => void;
  readonly createPeerConnection?: () => PeerConnectionLike;
  readonly getVideoCodecs?: () => RTCRtpCodec[];
  readonly fetch?: typeof fetch;
}

export const RETRY_INITIAL_MS = 1000;
export const RETRY_MAX_MS = 10000;
export const ICE_GATHERING_TIMEOUT_MS = 2000;
/** A session MediaMTX closes sooner than this after it connected was refused, not lost. */
export const REFUSAL_WINDOW_MS = 3000;

const H264_PREFERRED_PROFILE = 'profile-level-id=42e01f';
const SUPPORT_CODECS = new Set(['video/rtx', 'video/red', 'video/ulpfec']);

/**
 * H.264 first — constrained baseline with packetization-mode 1 at the very
 * front, as the profile every RTSP reader handles — then the retransmission
 * and redundancy entries H.264 relies on. Every other video codec is dropped.
 */
export function preferH264(codecs: readonly RTCRtpCodec[]): RTCRtpCodec[] {
  const isH264 = (c: RTCRtpCodec) => c.mimeType.toLowerCase() === 'video/h264';
  const score = (c: RTCRtpCodec) => {
    const fmtp = c.sdpFmtpLine ?? '';
    return (
      (fmtp.includes(H264_PREFERRED_PROFILE) ? 2 : 0) +
      (fmtp.includes('packetization-mode=1') ? 1 : 0)
    );
  };
  const h264 = codecs.filter(isH264).sort((a, b) => score(b) - score(a));
  if (h264.length === 0) {
    throw new Error('This browser offers no H.264 encoder for WebRTC.');
  }
  const support = codecs.filter((c) => SUPPORT_CODECS.has(c.mimeType.toLowerCase()));
  return [...h264, ...support];
}

export class WhipPublisher {
  private readonly _options: WhipPublisherOptions;
  private readonly _createPeerConnection: () => PeerConnectionLike;
  private readonly _getVideoCodecs: () => RTCRtpCodec[];
  private readonly _fetch: typeof fetch;
  private _state: PublisherState = 'idle';
  private _running = false;
  private _attempt = 0;
  private _peer: PeerConnectionLike | undefined;
  private _resourceUrl: string | undefined;
  /** An earlier session's address, to DELETE before the next POST. */
  private _staleUrl: string | undefined;
  private _retryTimer: ReturnType<typeof setTimeout> | undefined;
  private _retryDelayMs = RETRY_INITIAL_MS;
  private _lastError: string | undefined;

  public constructor(options: WhipPublisherOptions) {
    this._options = options;
    this._createPeerConnection =
      options.createPeerConnection ??
      (() => new RTCPeerConnection() as unknown as PeerConnectionLike);
    this._getVideoCodecs =
      options.getVideoCodecs ?? (() => RTCRtpSender.getCapabilities('video')?.codecs ?? []);
    this._fetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  public get state(): PublisherState {
    return this._state;
  }

  public get lastError(): string | undefined {
    return this._lastError;
  }

  public start(): void {
    if (this._running) return;
    this._running = true;
    void this._connect();
  }

  public stop(): void {
    this._running = false;
    this._attempt++;
    clearTimeout(this._retryTimer);
    this._retryTimer = undefined;
    this._peer?.close();
    this._peer = undefined;
    for (const url of [this._resourceUrl, this._staleUrl]) {
      // Best effort, and `keepalive` lets it outlive a page that is unloading.
      if (url !== undefined) {
        this._fetch(url, { method: 'DELETE', keepalive: true }).catch(() => {});
      }
    }
    this._resourceUrl = undefined;
    this._staleUrl = undefined;
    this._setState('stopped');
  }

  private async _connect(): Promise<void> {
    const attempt = ++this._attempt;
    this._setState('connecting');
    const peer = this._createPeerConnection();
    this._peer = peer;
    try {
      const codecs = preferH264(this._getVideoCodecs());
      for (const track of this._options.tracks) {
        peer.addTransceiver(track, { direction: 'sendonly' }).setCodecPreferences(codecs);
      }
      await peer.setLocalDescription(await peer.createOffer());
      await waitForIceGathering(peer, ICE_GATHERING_TIMEOUT_MS);
      if (attempt !== this._attempt) return;
      await this._endStaleSession();
      if (attempt !== this._attempt) return;

      const response = await this._fetch(this._options.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: peer.localDescription?.sdp ?? '',
      });
      if (attempt !== this._attempt) return;
      if (response.status !== 201) {
        throw new Error(`WHIP endpoint answered ${response.status} ${response.statusText}`.trim());
      }
      const location = response.headers.get('Location');
      this._resourceUrl =
        location === null ? undefined : new URL(location, this._options.endpointUrl).toString();
      const answer = await response.text();
      if (attempt !== this._attempt) return;
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });

      let connectedAt: number | undefined;
      // MediaMTX closes a refused publisher's session without closing the
      // peer connection, which stays `connected` for seconds more.
      const transport = peer.getSenders()[0]?.transport ?? null;
      transport?.addEventListener('statechange', () => {
        if (attempt !== this._attempt || transport.state !== 'closed') return;
        if (connectedAt !== undefined && Date.now() - connectedAt < REFUSAL_WINDOW_MS) {
          this._giveUp('another publisher already has this stream');
        } else {
          this._retry('MediaMTX closed the session');
        }
      });
      peer.addEventListener('connectionstatechange', () => {
        if (attempt !== this._attempt) return;
        const s = peer.connectionState;
        if (s === 'connected') {
          connectedAt = Date.now();
          this._retryDelayMs = RETRY_INITIAL_MS;
          this._lastError = undefined;
          this._setState('publishing');
        } else if (s === 'failed' || s === 'disconnected' || s === 'closed') {
          this._retry(`connection ${s}`);
        }
      });
    } catch (error) {
      if (attempt !== this._attempt) return;
      this._retry(error instanceof Error ? error.message : String(error));
    }
  }

  /** Ends the session an earlier attempt left; only a 2xx or a 404 means it is gone. */
  private async _endStaleSession(): Promise<void> {
    const url = this._staleUrl;
    if (url === undefined) return;
    const response = await this._fetch(url, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Could not end the previous WHIP session: ${response.status} ${response.statusText}`.trim(),
      );
    }
    if (this._staleUrl === url) this._staleUrl = undefined;
  }

  private _giveUp(reason: string): void {
    this._attempt++;
    this._running = false;
    this._lastError = reason;
    this._release();
    this._setState('taken', reason);
  }

  private _retry(reason: string): void {
    this._attempt++;
    this._lastError = reason;
    this._release();
    this._setState('retrying', reason);
    this._retryTimer = setTimeout(() => void this._connect(), this._retryDelayMs);
    this._retryDelayMs = Math.min(this._retryDelayMs * 2, RETRY_MAX_MS);
  }

  /** Closes the peer and keeps its session's address for the next attempt to DELETE. */
  private _release(): void {
    this._peer?.close();
    this._peer = undefined;
    this._staleUrl = this._resourceUrl ?? this._staleUrl;
    this._resourceUrl = undefined;
  }

  private _setState(state: PublisherState, detail?: string): void {
    if (state === this._state && detail === undefined) return;
    this._state = state;
    this._options.onStateChange?.(state, detail);
  }
}

/** Resolves when gathering completes, or after the timeout with whatever was found. */
function waitForIceGathering(peer: PeerConnectionLike, timeoutMs: number): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (peer.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    peer.addEventListener('icegatheringstatechange', onChange);
  });
}
