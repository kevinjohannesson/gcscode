// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { linkState } from './link-state.svelte';
import LinkStateView from './link-state-view.svelte';
import { stationLink } from './station-link.svelte';

/** Stands in for the browser's WebSocket behind the view's station link. */
class FakeStationSocket {
  public static latest: FakeStationSocket | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public onclose: (() => void) | null = null;
  public constructor(public readonly url: string) {
    FakeStationSocket.latest = this;
  }
  public close(): void {}
}

function station(): FakeStationSocket {
  if (!FakeStationSocket.latest) throw new Error('no station socket');
  return FakeStationSocket.latest;
}

function heartbeat(systemId: number) {
  return {
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: { type: 'HEARTBEAT', mavtype: { type: 'MAV_TYPE_QUADROTOR' } },
  };
}

const text = (id: string) => screen.getByTestId(id).textContent?.replace(/\s+/g, ' ').trim();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  linkState.reset();
  FakeStationSocket.latest = null;
  vi.stubGlobal('WebSocket', FakeStationSocket);
  stationLink.start('ws://127.0.0.1:8091/ws');
});
afterEach(() => {
  stationLink.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('LinkStateView', () => {
  it('says no heartbeat has been heard before any arrives', async () => {
    const result = render(LinkStateView);
    expect(text('bridge')).toBe('connecting for 0.0 s');
    expect(text('station')).toBe('connecting for 0.0 s');
    expect(screen.queryByTestId('station-hint')).toBeNull();
    expect(text('no-systems')).toBe('No heartbeat heard yet.');
    expect(screen.queryByTestId('no-reconnect')).toBeNull();
    result.unmount();
    // What is left is the station link's, which belongs to the extension, not the view.
    stationLink.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows a silent vehicle's age growing while the other stays fresh", async () => {
    linkState.setBridge('connected');
    linkState.noteMessage(heartbeat(1));
    linkState.noteMessage(heartbeat(2));
    const result = render(LinkStateView);

    // Vehicle 1 keeps beating at 1 Hz; vehicle 2 has stopped.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(1_000);
      linkState.noteMessage(heartbeat(1));
    }
    await vi.advanceTimersByTimeAsync(250);

    expect(text('bridge')).toBe('up for 4.3 s');
    expect(text('age-1')).toBe('0.3 s ago');
    expect(text('age-2')).toBe('4.3 s ago');
    result.unmount();
  });

  it('shows the bridge down, says it will not reconnect, and keeps the ages running', async () => {
    linkState.setBridge('connected');
    linkState.noteMessage(heartbeat(1));
    const result = render(LinkStateView);
    await vi.advanceTimersByTimeAsync(1_000);

    linkState.setBridge('disconnected');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(text('bridge')).toBe('down for 2.0 s');
    expect(text('no-reconnect')).toBe(
      'gcscode does not reconnect after a drop yet. Reload the page once mavlink2rest is back.',
    );
    expect(text('age-1')).toBe('3.0 s ago');
    result.unmount();
  });

  it('shows the station running, with its version and for how long', async () => {
    const result = render(LinkStateView);
    await vi.advanceTimersByTimeAsync(500);
    station().onmessage?.({ data: '{"type":"hello","protocol":0,"station":"0.1.0"}' });
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1_000);
      station().onmessage?.({ data: '{"type":"input","radio":null,"eventsPerSecond":0}' });
    }

    expect(text('station')).toBe('running for 3.0 s (gcscode-station 0.1.0)');
    expect(screen.queryByTestId('station-hint')).toBeNull();
    result.unmount();
  });

  it('flips to not running when the station stops, and says how to start it', async () => {
    station().onmessage?.({ data: '{"type":"hello","protocol":0,"station":"0.1.0"}' });
    const result = render(LinkStateView);
    await vi.advanceTimersByTimeAsync(1_000);
    station().onclose?.();
    await vi.advanceTimersByTimeAsync(1_500);

    expect(text('station')).toBe('not running for 1.5 s');
    expect(screen.getByTestId('station').classList.contains('not-running')).toBe(true);
    expect(text('station-hint')).toBe(
      'Nothing answers at ws://127.0.0.1:8091/ws; this view keeps trying. pnpm dev:sitl starts the station, or pnpm --filter mavlink-station start alone. If it is running, it may have refused this page: its terminal says so.',
    );
    result.unmount();
  });

  it('says a station that speaks another protocol is not usable, and why', async () => {
    const result = render(LinkStateView);
    station().onmessage?.({ data: '{"type":"hello","protocol":1,"station":"0.2.0"}' });
    await vi.advanceTimersByTimeAsync(500);

    expect(text('station')).toBe('not usable for 0.5 s');
    expect(text('station-hint')).toBe(
      'The station at ws://127.0.0.1:8091/ws speaks protocol 1, this page protocol 0. Run the two from the same checkout.',
    );
    result.unmount();
  });
});
