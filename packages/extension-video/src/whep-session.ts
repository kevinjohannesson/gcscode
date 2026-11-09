// WHEP (WebRTC-HTTP Egress) over RTCPeerConnection: the one module that speaks
// the protocol. It tells the panel what happened through the transport-neutral
// reports in `video-source.ts`; the panel never sees SDP or HTTP.
import type { ReportListener, SessionReport, VideoSession } from './video-source';

/** How often `getStats()` is asked whether a frame has been decoded. */
export const PICTURE_POLL_MS = 250;
/** How long `disconnected` may last before the video counts as lost. */
export const DISCONNECTED_GRACE_MS = 5000;

export interface WhepEnvironment {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  RTCPeerConnection: (new () => RTCPeerConnection) | undefined;
}

function globalEnvironment(): WhepEnvironment {
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    RTCPeerConnection: (globalThis as { RTCPeerConnection?: new () => RTCPeerConnection })
      .RTCPeerConnection,
  };
}

export function openWhepSession(
  url: string,
  listener: ReportListener,
  env: WhepEnvironment = globalEnvironment(),
): VideoSession {
  let closed = false;
  let failed = false;
  let streamReported = false;
  let location: string | undefined;
  let pc: RTCPeerConnection | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  function stopTimers(): void {
    if (pollTimer !== undefined) clearInterval(pollTimer);
    if (graceTimer !== undefined) clearTimeout(graceTimer);
    pollTimer = undefined;
    graceTimer = undefined;
  }

  function report(r: SessionReport): void {
    if (closed || failed) return;
    if (r.kind !== 'stream' && r.kind !== 'picture') {
      failed = true;
      stopTimers();
    }
    try {
      listener(r);
    } catch {
      // A throwing listener is the listener's problem, not the session's.
    }
  }

  // A report made while `openWhepSession` is still on the stack is deferred, so
  // the caller holds the session before any report arrives.
  function reportLater(r: SessionReport): void {
    queueMicrotask(() => report(r));
  }

  function sendDelete(href: string): void {
    try {
      env.fetch(href, { method: 'DELETE' }).catch(() => {});
    } catch {
      // Nothing to do: the server expires the session on its own.
    }
  }

  function resolveLocation(response: Response): string | undefined {
    const header = response.headers.get('Location');
    if (!header) return undefined;
    try {
      return new URL(header, url).href;
    } catch {
      return undefined;
    }
  }

  function watchConnection(conn: RTCPeerConnection): void {
    conn.addEventListener('connectionstatechange', () => {
      if (closed || failed) return;
      const state = conn.connectionState;
      if (state === 'failed') {
        report({ kind: 'dropped', label: url });
        return;
      }
      if (state === 'disconnected') {
        if (graceTimer === undefined) {
          graceTimer = setTimeout(() => {
            graceTimer = undefined;
            report({ kind: 'dropped', label: url });
          }, DISCONNECTED_GRACE_MS);
        }
        return;
      }
      if (graceTimer !== undefined) {
        clearTimeout(graceTimer);
        graceTimer = undefined;
      }
    });
  }

  function startPicturePoll(conn: RTCPeerConnection): void {
    let pending = false;
    pollTimer = setInterval(() => {
      if (pending) return;
      pending = true;
      let stats: Promise<RTCStatsReport>;
      try {
        stats = conn.getStats();
      } catch {
        pending = false;
        return;
      }
      stats
        .then((entries) => {
          let decoded = false;
          entries.forEach((entry: { type?: string; kind?: string; framesDecoded?: number }) => {
            if (
              entry.type === 'inbound-rtp' &&
              entry.kind === 'video' &&
              (entry.framesDecoded ?? 0) > 0
            ) {
              decoded = true;
            }
          });
          if (decoded && !closed && !failed) {
            if (pollTimer !== undefined) clearInterval(pollTimer);
            pollTimer = undefined;
            report({ kind: 'picture' });
          }
        })
        .catch(() => {})
        .then(() => {
          pending = false;
        });
    }, PICTURE_POLL_MS);
  }

  function onTrack(event: Event): void {
    if (streamReported) return;
    const { track, streams } = event as Event & { track: MediaStreamTrack; streams: MediaStream[] };
    track.addEventListener('ended', () => report({ kind: 'dropped', label: url }));
    let stream: MediaStream | undefined = streams[0];
    if (!stream) {
      try {
        stream = new MediaStream([track]);
      } catch {
        report({ kind: 'unsupported', label: url });
        return;
      }
    }
    streamReported = true;
    report({ kind: 'stream', stream });
  }

  async function waitForGathering(conn: RTCPeerConnection): Promise<void> {
    if (conn.iceGatheringState === 'complete') return;
    await new Promise<void>((resolve) => {
      conn.addEventListener('icegatheringstatechange', () => {
        if (conn.iceGatheringState === 'complete') resolve();
      });
    });
  }

  async function negotiate(conn: RTCPeerConnection): Promise<void> {
    let offer: string;
    try {
      const description = await conn.createOffer();
      await conn.setLocalDescription(description);
      await waitForGathering(conn);
      // The offer `createOffer()` returned has no candidates; the local
      // description, read after gathering, does.
      offer = conn.localDescription?.sdp ?? description.sdp ?? '';
    } catch {
      reportLater({ kind: 'unsupported', label: url });
      return;
    }
    if (closed) return;

    let response: Response;
    try {
      response = await env.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer,
      });
    } catch {
      report({ kind: 'unreachable', label: url });
      return;
    }

    const accepted = response.status >= 200 && response.status < 300;
    // Only an accepted session has a resource to delete.
    if (accepted) location = resolveLocation(response);
    if (closed) {
      // Closed while the POST was in flight: leave no reader behind.
      if (location) sendDelete(location);
      return;
    }
    if (response.status === 404) {
      report({ kind: 'no-stream', label: url });
      return;
    }
    if (!accepted) {
      report({ kind: 'refused', label: url, detail: String(response.status) });
      return;
    }

    try {
      const sdp = await response.text();
      // `close()` already deleted `location`, which was set before this await.
      if (closed) return;
      await conn.setRemoteDescription({ type: 'answer', sdp });
    } catch {
      report({ kind: 'refused', label: url, detail: 'bad answer' });
      return;
    }
    if (closed || failed) return;
    watchConnection(conn);
    startPicturePoll(conn);
  }

  try {
    const Ctor = env.RTCPeerConnection;
    if (!Ctor) {
      reportLater({ kind: 'unsupported', label: url });
    } else {
      const conn = new Ctor();
      pc = conn;
      conn.addEventListener('track', onTrack);
      conn.addTransceiver('video', { direction: 'recvonly' });
      negotiate(conn).catch(() => report({ kind: 'unsupported', label: url }));
    }
  } catch {
    reportLater({ kind: 'unsupported', label: url });
  }

  return {
    close(): void {
      if (closed) return;
      closed = true;
      stopTimers();
      // `DELETE` and `pc.close()` race: MediaMTX drops the session as soon as the
      // peer connection closes, so the CORS-preflighted `DELETE` usually gets a
      // 404. The session ends either way (measured live: `DELETE` before close
      // answers 200, after close 404).
      try {
        pc?.close();
      } catch {
        // Already gone.
      }
      if (location) sendDelete(location);
    },
  };
}
