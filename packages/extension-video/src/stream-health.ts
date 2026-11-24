// Turns two of a session's samples into the numbers the health view shows.
// Pure: the monitor owns the clock and the polling.
import type { ConnectionState, StreamSample } from './video-source';

/** A sample with the moment it was read, in milliseconds on one clock. */
export interface TimedSample {
  at: number;
  sample: StreamSample;
}

export interface StreamHealth {
  /** `none` while the Video panel holds no session. */
  connection: ConnectionState | 'none';
  /** Frames decoded per second over the last interval. */
  framesPerSecond: number | null;
  /** Milliseconds since the frame count last went up; null before any frame. */
  sinceLastFrameMs: number | null;
  /** Kilobits per second received over the last interval. */
  bitrateKbps: number | null;
  /** Percent of packets lost over the last interval; null when none were due. */
  packetLossPercent: number | null;
}

export const NO_SESSION: StreamHealth = {
  connection: 'none',
  framesPerSecond: null,
  sinceLastFrameMs: null,
  bitrateKbps: null,
  packetLossPercent: null,
};

/** What the next reading needs from the one before. */
export interface HealthMemory {
  previous: TimedSample;
  /** When the frame count last went up, or null before any frame. */
  lastFrameAt: number | null;
}

/**
 * The health after `current`, given what was remembered from the session's
 * previous sample (`undefined` for its first).
 */
export function advance(
  memory: HealthMemory | undefined,
  current: TimedSample,
): { health: StreamHealth; memory: HealthMemory } {
  const { at, sample } = current;
  const previous = memory?.previous;
  const newFrame = sample.framesDecoded > (previous?.sample.framesDecoded ?? 0);
  const lastFrameAt = newFrame ? at : (memory?.lastFrameAt ?? null);

  let framesPerSecond: number | null = null;
  let bitrateKbps: number | null = null;
  let packetLossPercent: number | null = null;
  const elapsed = previous === undefined ? 0 : at - previous.at;
  if (previous !== undefined && elapsed > 0) {
    const frames = sample.framesDecoded - previous.sample.framesDecoded;
    const bytes = sample.bytesReceived - previous.sample.bytesReceived;
    const received = sample.packetsReceived - previous.sample.packetsReceived;
    // packetsLost can fall when late packets arrive after all; never below 0.
    const lost = Math.max(0, sample.packetsLost - previous.sample.packetsLost);
    framesPerSecond = (frames * 1000) / elapsed;
    bitrateKbps = (bytes * 8) / elapsed;
    packetLossPercent = received + lost > 0 ? (lost * 100) / (received + lost) : null;
  }

  return {
    health: {
      connection: sample.connection,
      framesPerSecond,
      sinceLastFrameMs: lastFrameAt === null ? null : at - lastFrameAt,
      bitrateKbps,
      packetLossPercent,
    },
    memory: { previous: current, lastFrameAt },
  };
}
