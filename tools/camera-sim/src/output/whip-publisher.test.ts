import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  preferH264,
  WhipPublisher,
  type PeerConnectionLike,
  type PublisherState,
} from './whip-publisher';

const codec = (mimeType: string, sdpFmtpLine?: string): RTCRtpCodec =>
  ({ mimeType, clockRate: 90000, sdpFmtpLine }) as RTCRtpCodec;

/** Roughly what Chrome offers: VP8 first, several H.264 profiles, support codecs. */
const CHROME_LIKE = [
  codec('video/VP8'),
  codec('video/rtx'),
  codec('video/H264', 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f'),
  codec('video/H264', 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f'),
  codec('video/H264', 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f'),
  codec('video/VP9'),
  codec('video/AV1'),
  codec('video/red'),
  codec('video/ulpfec'),
];

describe('preferH264', () => {
  it('puts constrained-baseline packetization-mode-1 H.264 first and drops other codecs', () => {
    expect(
      preferH264(CHROME_LIKE).map((c) => `${c.mimeType} ${c.sdpFmtpLine ?? ''}`.trim()),
    ).toEqual([
      'video/H264 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
      'video/H264 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f',
      'video/H264 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f',
      'video/rtx',
      'video/red',
      'video/ulpfec',
    ]);
  });

  it('refuses to publish without H.264', () => {
    expect(() => preferH264([codec('video/VP8'), codec('video/rtx')])).toThrow(
      'This browser offers no H.264 encoder for WebRTC.',
    );
  });
});

class FakePeer implements PeerConnectionLike {
  public localDescription: { sdp: string } | null = null;
  public iceGatheringState: RTCIceGatheringState = 'new';
  public connectionState: RTCPeerConnectionState = 'new';
  public remote: RTCSessionDescriptionInit | undefined;
  public codecPreferences: RTCRtpCodec[][] = [];
  public directions: (RTCRtpTransceiverDirection | undefined)[] = [];
  public closed = false;
  private readonly _listeners = new Map<string, Set<() => void>>();

  public addTransceiver(_track: MediaStreamTrack, init: RTCRtpTransceiverInit) {
    this.directions.push(init.direction);
    return { setCodecPreferences: (c: RTCRtpCodec[]) => void this.codecPreferences.push(c) };
  }
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0 offer' };
  }
  public async setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = { sdp: `${d.sdp} +candidates` };
    // Gathering finishes on the next tick, as it does in a browser.
    setTimeout(
      () => this.emit('icegatheringstatechange', () => (this.iceGatheringState = 'complete')),
      0,
    );
  }
  public async setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.remote = d;
  }
  public addEventListener(type: string, listener: () => void): void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(listener);
  }
  public removeEventListener(type: string, listener: () => void): void {
    this._listeners.get(type)?.delete(listener);
  }
  public close(): void {
    this.closed = true;
  }
  public emit(type: string, mutate: () => void): void {
    mutate();
    for (const l of this._listeners.get(type) ?? []) l();
  }
  public connect(state: RTCPeerConnectionState): void {
    this.emit('connectionstatechange', () => (this.connectionState = state));
  }
}

interface Call {
  url: string;
  method: string;
  contentType?: string;
  body?: string;
}

describe('WhipPublisher', () => {
  let peers: FakePeer[];
  let calls: Call[];
  let states: PublisherState[];
  let respond: () => Response;
  let publisher: WhipPublisher;
  const track = { kind: 'video' } as MediaStreamTrack;

  beforeEach(() => {
    vi.useFakeTimers();
    peers = [];
    calls = [];
    states = [];
    respond = () =>
      new Response('v=0 answer', { status: 201, headers: { Location: '/drone-1/whip/abc' } });
    publisher = new WhipPublisher({
      endpointUrl: 'http://media:8889/drone-1/whip',
      tracks: [track],
      onStateChange: (s) => states.push(s),
      createPeerConnection: () => {
        const p = new FakePeer();
        peers.push(p);
        return p;
      },
      getVideoCodecs: () => CHROME_LIKE,
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        calls.push({
          url: String(input),
          method: init?.method ?? 'GET',
          contentType: headers.get('Content-Type') ?? undefined,
          body: typeof init?.body === 'string' ? init.body : undefined,
        });
        return init?.method === 'DELETE' ? new Response(null, { status: 200 }) : respond();
      },
    });
  });

  afterEach(() => {
    publisher.stop();
    vi.useRealTimers();
  });

  it('POSTs the gathered offer as application/sdp and applies the answer', async () => {
    publisher.start();
    await vi.runAllTimersAsync();
    expect(calls).toEqual([
      {
        url: 'http://media:8889/drone-1/whip',
        method: 'POST',
        contentType: 'application/sdp',
        body: 'v=0 offer +candidates',
      },
    ]);
    expect(peers[0]!.remote).toEqual({ type: 'answer', sdp: 'v=0 answer' });
    expect(peers[0]!.directions).toEqual(['sendonly']);
    expect(peers[0]!.codecPreferences[0]![0]!.sdpFmtpLine).toContain(
      'packetization-mode=1;profile-level-id=42e01f',
    );
  });

  it('reports publishing only once the media connection is up', async () => {
    publisher.start();
    await vi.runAllTimersAsync();
    expect(publisher.state).toBe('connecting');
    peers[0]!.connect('connected');
    expect(states).toEqual(['connecting', 'publishing']);
  });

  it('retries after 1 s when the media server is not there, then 2 s', async () => {
    respond = () => new Response('', { status: 404, statusText: 'Not Found' });
    publisher.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(publisher.state).toBe('retrying');
    expect(publisher.lastError).toBe('WHIP endpoint answered 404 Not Found');
    expect(peers[0]!.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(989);
    expect(peers).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(11);
    expect(peers).toHaveLength(2);

    // The second attempt ran at t = 1000 ms, so the next is due at 3000 ms.
    await vi.advanceTimersByTimeAsync(1989);
    expect(peers).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2);
    expect(peers).toHaveLength(3);
  });

  it('republishes when an established connection fails, releasing the old session', async () => {
    publisher.start();
    await vi.runAllTimersAsync();
    peers[0]!.connect('connected');
    peers[0]!.connect('failed');
    expect(publisher.state).toBe('retrying');
    await vi.advanceTimersByTimeAsync(1010);
    expect(peers).toHaveLength(2);
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url)).toEqual([
      'http://media:8889/drone-1/whip/abc',
    ]);
  });

  it('can be started again after a stop', async () => {
    publisher.start();
    await vi.runAllTimersAsync();
    publisher.stop();
    publisher.start();
    await vi.runAllTimersAsync();
    expect(peers).toHaveLength(2);
    expect(publisher.state).toBe('connecting');
  });

  it('stops for good: closes the peer, deletes the session, never retries', async () => {
    publisher.start();
    await vi.runAllTimersAsync();
    publisher.stop();
    peers[0]!.connect('failed');
    await vi.advanceTimersByTimeAsync(60000);
    expect(peers).toHaveLength(1);
    expect(peers[0]!.closed).toBe(true);
    expect(calls.at(-1)).toEqual({
      url: 'http://media:8889/drone-1/whip/abc',
      method: 'DELETE',
      contentType: undefined,
      body: undefined,
    });
    expect(publisher.state).toBe('stopped');
  });
});
