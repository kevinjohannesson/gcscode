import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionReport } from './video-source';
import { answer, createFetchStub, FakePeerConnection, type FetchCall } from './test-fakes';
import { openWhepSession, type WhepEnvironment } from './whep-session';

const url = 'http://localhost:8889/drone-1/whep';

function setup(
  respond: (call: FetchCall) => Promise<Response> = answer('fake-answer-sdp', 201, {
    Location: '/drone-1/whep/abc',
  }),
) {
  const stub = createFetchStub(respond);
  const reports: SessionReport[] = [];
  const env: WhepEnvironment = {
    fetch: stub.fetch,
    RTCPeerConnection: FakePeerConnection as unknown as new () => RTCPeerConnection,
  };
  const open = () => openWhepSession(url, (r) => reports.push(r), env);
  const pc = () => FakePeerConnection.instances[0]!;
  const posts = () => stub.calls.filter((c) => c.init.method === 'POST');
  const deletes = () => stub.calls.filter((c) => c.init.method === 'DELETE');
  return { stub, reports, env, open, pc, posts, deletes };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  FakePeerConnection.instances = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('offer and answer', () => {
  it('adds a recvonly video transceiver', async () => {
    const t = setup();
    t.open();
    await settle();
    expect(t.pc().transceivers).toEqual([{ kind: 'video', init: { direction: 'recvonly' } }]);
  });

  it('waits for ICE gathering to complete before posting', async () => {
    const t = setup();
    // Make the next peer connection start in 'gathering'.
    const Base = FakePeerConnection;
    class Gathering extends Base {
      override iceGatheringState: RTCIceGatheringState = 'gathering';
    }
    t.env.RTCPeerConnection = Gathering as unknown as new () => RTCPeerConnection;
    t.open();
    await settle();
    expect(t.posts()).toHaveLength(0);
    t.pc().setGatheringState('complete');
    await settle();
    expect(t.posts()).toHaveLength(1);
  });

  it('posts the offer as application/sdp and applies the answer', async () => {
    const t = setup();
    t.open();
    await settle();
    expect(t.stub.calls[0]).toEqual({
      url,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: 'fake-offer-sdp',
      },
    });
    expect(t.pc().remoteDescriptions).toEqual([{ type: 'answer', sdp: 'fake-answer-sdp' }]);
  });

  it('reports the stream once', async () => {
    const t = setup();
    t.open();
    await settle();
    expect(t.reports).toEqual([{ kind: 'stream', stream: t.pc().fakeStream }]);
  });
});

describe('picture', () => {
  it('reports nothing while no frame has been decoded', async () => {
    const t = setup();
    t.open();
    await settle();
    t.reports.length = 0;
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.reports).toEqual([]);
  });

  it('reports one picture once frames are decoded, then stops polling', async () => {
    const t = setup();
    t.open();
    await settle();
    t.reports.length = 0;
    await vi.advanceTimersByTimeAsync(1000);
    t.pc().framesDecoded = 3;
    await vi.advanceTimersByTimeAsync(250);
    expect(t.reports).toEqual([{ kind: 'picture' }]);
    const calls = t.pc().getStatsCalls;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.pc().getStatsCalls).toBe(calls);
    expect(t.reports).toEqual([{ kind: 'picture' }]);
  });

  it('skips a tick while the previous getStats is pending', async () => {
    const t = setup();
    t.open();
    await settle();
    t.pc().hangStats = true;
    const before = t.pc().getStatsCalls;
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.pc().getStatsCalls).toBe(before + 1);
  });
});

describe('failures', () => {
  it('reports unreachable when fetch rejects', async () => {
    const t = setup(() => Promise.reject(new Error('network')));
    t.open();
    await settle();
    expect(t.reports).toEqual([{ kind: 'unreachable', label: url }]);
  });

  it('reports no-stream for a 404', async () => {
    const t = setup(answer('', 404));
    t.open();
    await settle();
    expect(t.reports).toEqual([{ kind: 'no-stream', label: url }]);
  });

  it('reports refused with the status for a 503', async () => {
    const t = setup(answer('', 503));
    t.open();
    await settle();
    expect(t.reports).toEqual([{ kind: 'refused', label: url, detail: '503' }]);
  });

  it('reports refused "bad answer" when the answer is rejected', async () => {
    const t = setup();
    class Rejecting extends FakePeerConnection {
      override rejectRemoteDescription = true;
    }
    t.env.RTCPeerConnection = Rejecting as unknown as new () => RTCPeerConnection;
    t.open();
    await settle();
    expect(t.reports).toEqual([{ kind: 'refused', label: url, detail: 'bad answer' }]);
  });

  it('reports unsupported, after a microtask, when RTCPeerConnection is missing', async () => {
    const t = setup();
    t.env.RTCPeerConnection = undefined;
    t.open();
    expect(t.reports).toEqual([]);
    await Promise.resolve();
    expect(t.reports).toEqual([{ kind: 'unsupported', label: url }]);
  });

  it('reports unsupported, after a microtask, when the constructor throws', async () => {
    const t = setup();
    t.env.RTCPeerConnection = class {
      constructor() {
        throw new Error('no webrtc');
      }
    } as unknown as new () => RTCPeerConnection;
    t.open();
    expect(t.reports).toEqual([]);
    await Promise.resolve();
    expect(t.reports).toEqual([{ kind: 'unsupported', label: url }]);
  });
});

describe('drops after the stream', () => {
  async function connected() {
    const t = setup();
    t.open();
    await settle();
    t.reports.length = 0;
    return t;
  }

  it('reports dropped at once on failed', async () => {
    const t = await connected();
    t.pc().setConnectionState('failed');
    expect(t.reports).toEqual([{ kind: 'dropped', label: url }]);
  });

  it('reports dropped when the track ends', async () => {
    const t = await connected();
    t.pc().fakeTrack.dispatchEvent(new Event('ended'));
    expect(t.reports).toEqual([{ kind: 'dropped', label: url }]);
  });

  it('reports dropped only after 5000 ms of disconnected', async () => {
    const t = await connected();
    t.pc().setConnectionState('disconnected');
    await vi.advanceTimersByTimeAsync(4999);
    expect(t.reports).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.reports).toEqual([{ kind: 'dropped', label: url }]);
  });

  it('reports nothing when disconnected recovers', async () => {
    const t = await connected();
    t.pc().setConnectionState('disconnected');
    await vi.advanceTimersByTimeAsync(3000);
    t.pc().setConnectionState('connected');
    await vi.advanceTimersByTimeAsync(10000);
    expect(t.reports).toEqual([]);
  });

  it('reports dropped once when failed is followed by ended', async () => {
    const t = await connected();
    t.pc().setConnectionState('failed');
    t.pc().fakeTrack.dispatchEvent(new Event('ended'));
    expect(t.reports).toEqual([{ kind: 'dropped', label: url }]);
  });
});

describe('close', () => {
  it('sends DELETE to the Location and closes the peer connection once', async () => {
    const t = setup();
    const session = t.open();
    await settle();
    session.close();
    await settle();
    expect(t.deletes()).toEqual([
      { url: 'http://localhost:8889/drone-1/whep/abc', init: { method: 'DELETE' } },
    ]);
    expect(t.pc().closeCalls).toBe(1);
  });

  it('is idempotent', async () => {
    const t = setup();
    const session = t.open();
    await settle();
    session.close();
    session.close();
    await settle();
    expect(t.deletes()).toHaveLength(1);
    expect(t.pc().closeCalls).toBe(1);
  });

  it('sends no DELETE without a Location but still closes the peer connection', async () => {
    const t = setup(answer('fake-answer-sdp', 201));
    const session = t.open();
    await settle();
    session.close();
    await settle();
    expect(t.deletes()).toHaveLength(0);
    expect(t.pc().closeCalls).toBe(1);
  });

  it('raises no unhandled rejection when DELETE rejects', async () => {
    const t = setup((call) =>
      call.init.method === 'DELETE'
        ? Promise.reject(new Error('gone'))
        : answer('fake-answer-sdp', 201, { Location: '/drone-1/whep/abc' })(),
    );
    const session = t.open();
    await settle();
    session.close();
    await settle();
    expect(t.deletes()).toHaveLength(1);
  });

  it('reports nothing itself', async () => {
    const t = setup();
    const session = t.open();
    await settle();
    t.reports.length = 0;
    session.close();
    await settle();
    expect(t.reports).toEqual([]);
  });

  it('stops polling stats', async () => {
    const t = setup();
    const session = t.open();
    await settle();
    session.close();
    const calls = t.pc().getStatsCalls;
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.pc().getStatsCalls).toBe(calls);
  });

  it('cancels a disconnected grace that began before close', async () => {
    const t = setup();
    const session = t.open();
    await settle();
    t.reports.length = 0;
    t.pc().setConnectionState('disconnected');
    await vi.advanceTimersByTimeAsync(1000);
    session.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.reports).toEqual([]);
  });
});

describe('close before the answer', () => {
  it('closes the peer connection, ignores the late answer and deletes its Location', async () => {
    let resolvePost!: (r: Response) => void;
    const t = setup((call) =>
      call.init.method === 'POST'
        ? new Promise<Response>((resolve) => {
            resolvePost = resolve;
          })
        : Promise.resolve(new Response(null, { status: 200 })),
    );
    const session = t.open();
    await settle();
    expect(t.posts()).toHaveLength(1);
    session.close();
    expect(t.pc().closeCalls).toBe(1);
    resolvePost(
      new Response('late-answer', { status: 201, headers: { Location: '/drone-1/whep/late' } }),
    );
    await settle();
    expect(t.pc().remoteDescriptions).toEqual([]);
    expect(t.reports).toEqual([]);
    expect(t.deletes()).toEqual([
      { url: 'http://localhost:8889/drone-1/whep/late', init: { method: 'DELETE' } },
    ]);
    expect(t.pc().closeCalls).toBe(1);
  });

  it('ignores an answer whose body is still being read when close() is called', async () => {
    let resolveBody!: (text: string) => void;
    const slow = {
      status: 201,
      headers: new Headers({ Location: '/drone-1/whep/slow' }),
      text: () =>
        new Promise<string>((resolve) => {
          resolveBody = resolve;
        }),
    } as unknown as Response;
    const t = setup(() => Promise.resolve(slow));
    const session = t.open();
    await settle();
    session.close();
    resolveBody('late-answer');
    await settle();
    expect(t.pc().remoteDescriptions).toEqual([]);
    expect(t.reports).toEqual([]);
    expect(t.deletes()).toEqual([
      { url: 'http://localhost:8889/drone-1/whep/slow', init: { method: 'DELETE' } },
    ]);
  });
});
