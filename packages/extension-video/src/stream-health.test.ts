import { describe, expect, it } from 'vitest';

import { advance, type HealthMemory, type StreamHealth, type TimedSample } from './stream-health';
import type { StreamSample } from './video-source';

function at(ms: number, totals: Partial<StreamSample>): TimedSample {
  return {
    at: ms,
    sample: {
      connection: 'connected',
      framesDecoded: 0,
      bytesReceived: 0,
      packetsReceived: 0,
      packetsLost: 0,
      ...totals,
    },
  };
}

/** Feeds samples in order and returns the health after each. */
function run(...samples: TimedSample[]): StreamHealth[] {
  let memory: HealthMemory | undefined;
  return samples.map((s) => {
    const next = advance(memory, s);
    memory = next.memory;
    return next.health;
  });
}

describe('advance', () => {
  it('has no rates on the first sample, and counts a frame already decoded as new', () => {
    const [first] = run(at(1000, { framesDecoded: 5, connection: 'connecting' }));
    expect(first).toEqual({
      connection: 'connecting',
      framesPerSecond: null,
      sinceLastFrameMs: 0,
      bitrateKbps: null,
      packetLossPercent: null,
    });
  });

  it('has no time since a frame before any frame', () => {
    const [, second] = run(at(0, {}), at(500, {}));
    expect(second!.sinceLastFrameMs).toBeNull();
  });

  it('works out the rates over the interval', () => {
    const [, second] = run(
      at(0, { framesDecoded: 10, bytesReceived: 1000, packetsReceived: 100, packetsLost: 2 }),
      at(500, { framesDecoded: 25, bytesReceived: 63_500, packetsReceived: 196, packetsLost: 6 }),
    );
    expect(second).toEqual({
      connection: 'connected',
      framesPerSecond: 30,
      sinceLastFrameMs: 0,
      bitrateKbps: 1000,
      packetLossPercent: 4,
    });
  });

  it('counts the time since the frame count last went up', () => {
    const health = run(
      at(0, { framesDecoded: 30 }),
      at(500, { framesDecoded: 45 }),
      at(1000, { framesDecoded: 45 }),
      at(1500, { framesDecoded: 45 }),
      at(2000, { framesDecoded: 46 }),
    );
    expect(health.map((h) => h.sinceLastFrameMs)).toEqual([0, 0, 500, 1000, 0]);
    expect(health.map((h) => h.framesPerSecond)).toEqual([null, 30, 0, 0, 2]);
  });

  it('has no loss figure when no packets were due, and never a negative one', () => {
    const health = run(
      at(0, { packetsReceived: 10, packetsLost: 5 }),
      at(500, { packetsReceived: 10, packetsLost: 5 }),
      at(1000, { packetsReceived: 20, packetsLost: 3 }),
    );
    expect(health[1]!.packetLossPercent).toBeNull();
    expect(health[2]!.packetLossPercent).toBe(0);
  });

  it('has no rates when two samples share a moment', () => {
    const [, second] = run(at(100, { framesDecoded: 1 }), at(100, { framesDecoded: 2 }));
    expect(second!.framesPerSecond).toBeNull();
    expect(second!.bitrateKbps).toBeNull();
  });
});
