/// <reference types="node" />
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { STATION_PROTOCOL } from './station-link.svelte';

// The page and the station must speak one protocol version (ADR-0015). The
// station's Rust constant is the version the station sends in its hello; the
// page's one copy is STATION_PROTOCOL. TypeScript cannot import Rust, so this
// reads the station's source and holds the two together.
const SNAPSHOT_RS = new URL('../../mavlink-station/src/snapshot.rs', import.meta.url);

function stationProtocol(): number {
  const match = /^pub const PROTOCOL: u32 = (\d+);$/m.exec(readFileSync(SNAPSHOT_RS, 'utf8'));
  if (!match)
    throw new Error('packages/mavlink-station/src/snapshot.rs has no `pub const PROTOCOL: u32`');
  return Number(match[1]);
}

describe('the station protocol', () => {
  it('is the one the station process sends in its hello', () => {
    expect(STATION_PROTOCOL).toBe(stationProtocol());
  });
});
