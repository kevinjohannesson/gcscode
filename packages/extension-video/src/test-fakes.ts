// Test doubles for the WHEP session. Not part of the package's public surface.
import type { WhepEnvironment } from './whep-session';

export class FakeTrack extends EventTarget {}

export class FakeStream {
  readonly id = 'fake-stream';
}

export class FakePeerConnection extends EventTarget {
  static instances: FakePeerConnection[] = [];

  readonly fakeTrack = new FakeTrack();
  readonly fakeStream = new FakeStream();

  iceGatheringState: RTCIceGatheringState = 'complete';
  connectionState: RTCPeerConnectionState = 'new';
  framesDecoded = 0;

  readonly transceivers: { kind: string; init: unknown }[] = [];
  readonly remoteDescriptions: unknown[] = [];
  getStatsCalls = 0;
  closeCalls = 0;
  callsAfterClose = 0;

  /** Makes `setRemoteDescription` reject, as a browser does for an SDP it cannot parse. */
  rejectRemoteDescription = false;
  /** Makes `getStats` return a promise that never settles. */
  hangStats = false;

  constructor() {
    super();
    FakePeerConnection.instances.push(this);
  }

  private touch(): void {
    if (this.closeCalls > 0) this.callsAfterClose += 1;
  }

  addTransceiver(kind: string, init: unknown): void {
    this.touch();
    this.transceivers.push({ kind, init });
  }

  async createOffer(): Promise<{ type: 'offer'; sdp: string }> {
    return { type: 'offer', sdp: 'fake-offer-sdp' };
  }

  async setLocalDescription(): Promise<void> {}

  async setRemoteDescription(description: unknown): Promise<void> {
    this.touch();
    this.remoteDescriptions.push(description);
    if (this.rejectRemoteDescription) throw new Error('bad sdp');
    const event = new Event('track') as Event & { track: unknown; streams: unknown[] };
    event.track = this.fakeTrack;
    event.streams = [this.fakeStream];
    this.dispatchEvent(event);
  }

  getStats(): Promise<Map<string, unknown>> {
    this.touch();
    this.getStatsCalls += 1;
    if (this.hangStats) return new Promise(() => {});
    return Promise.resolve(
      new Map<string, unknown>([
        ['v', { type: 'inbound-rtp', kind: 'video', framesDecoded: this.framesDecoded }],
      ]),
    );
  }

  close(): void {
    this.closeCalls += 1;
  }

  setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.dispatchEvent(new Event('connectionstatechange'));
  }

  setGatheringState(state: RTCIceGatheringState): void {
    this.iceGatheringState = state;
    this.dispatchEvent(new Event('icegatheringstatechange'));
  }
}

export interface FetchCall {
  url: string;
  init: RequestInit;
}

export interface FetchStub {
  calls: FetchCall[];
  fetch: WhepEnvironment['fetch'];
}

/** A fetch stub that answers every call with `respond(call)`. */
export function createFetchStub(respond: (call: FetchCall) => Promise<Response>): FetchStub {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetch: (url, init) => {
      const call = { url, init };
      calls.push(call);
      return respond(call);
    },
  };
}

export function answer(body: string, status = 201, headers: Record<string, string> = {}) {
  return () => Promise.resolve(new Response(body, { status, headers }));
}
