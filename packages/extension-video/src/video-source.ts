// The seam between the panel and whatever carries the picture. Transport-neutral:
// nothing here names WHEP, SDP or HTTP, so a different transport can replace the
// session without touching the panel.

/** What a session tells the panel. After a failure report a session reports nothing more. */
export type SessionReport =
  | { kind: 'stream'; stream: MediaStream }
  | { kind: 'picture' }
  | { kind: 'unreachable' | 'no-stream' | 'dropped' | 'unsupported'; label: string }
  | { kind: 'refused'; label: string; detail: string };

export type ReportListener = (report: SessionReport) => void;

/** A connection's state, in the words WebRTC uses for it. */
export type ConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * The session's running totals at one moment, for the health view. Counters
 * only grow while one session lasts; rates are the reader's to work out.
 */
export interface StreamSample {
  connection: ConnectionState;
  framesDecoded: number;
  bytesReceived: number;
  packetsReceived: number;
  packetsLost: number;
}

export interface VideoSession {
  /** Ends the session. Idempotent, never throws, reports nothing. */
  close(): void;
  /**
   * Reads the session's totals without opening anything new. Never rejects:
   * resolves `null` once the session is closed or when they can't be read.
   */
  sample(): Promise<StreamSample | null>;
}

export type OpenVideoSession = (listener: ReportListener) => VideoSession;
