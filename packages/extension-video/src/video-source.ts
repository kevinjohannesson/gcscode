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

export interface VideoSession {
  /** Ends the session. Idempotent, never throws, reports nothing. */
  close(): void;
}

export type OpenVideoSession = (listener: ReportListener) => VideoSession;
