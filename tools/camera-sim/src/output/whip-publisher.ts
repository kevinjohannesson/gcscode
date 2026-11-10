/**
 * Publishes a MediaStream to a WHIP endpoint (MediaMTX: `<media>/<stream>/whip`).
 *
 * WHIP is one HTTP exchange: POST an SDP offer, get an SDP answer and a
 * resource URL back; DELETE that URL to stop. ICE candidates are gathered
 * before the POST, which is enough on a LAN and keeps the client simple.
 *
 * H.264 only: MediaMTX can re-serve H.264 as RTSP to every reader, and it is
 * what real camera payloads send.
 */

export type PublisherState = 'idle' | 'connecting' | 'publishing' | 'retrying' | 'stopped';

/** The parts of RTCPeerConnection this class uses, so tests can supply a fake. */
export interface PeerConnectionLike {
  addTransceiver(
    track: MediaStreamTrack,
    init: RTCRtpTransceiverInit,
  ): { setCodecPreferences(codecs: RTCRtpCodec[]): void };
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
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
    this._teardown();
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

      peer.addEventListener('connectionstatechange', () => {
        if (attempt !== this._attempt) return;
        const s = peer.connectionState;
        if (s === 'connected') {
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

  private _retry(reason: string): void {
    this._attempt++;
    this._lastError = reason;
    this._teardown();
    this._setState('retrying', reason);
    this._retryTimer = setTimeout(() => void this._connect(), this._retryDelayMs);
    this._retryDelayMs = Math.min(this._retryDelayMs * 2, RETRY_MAX_MS);
  }

  private _teardown(): void {
    this._peer?.close();
    this._peer = undefined;
    const resource = this._resourceUrl;
    this._resourceUrl = undefined;
    // Best effort: MediaMTX also drops the session when the peer goes away.
    if (resource !== undefined) this._fetch(resource, { method: 'DELETE' }).catch(() => {});
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
