// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { linkState } from './link-state.svelte';
import LinkStateView from './link-state-view.svelte';

function heartbeat(systemId: number) {
  return {
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: { type: 'HEARTBEAT', mavtype: { type: 'MAV_TYPE_QUADROTOR' } },
  };
}

const text = (id: string) => screen.getByTestId(id).textContent?.trim();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  linkState.reset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('LinkStateView', () => {
  it('says no heartbeat has been heard before any arrives', async () => {
    const result = render(LinkStateView);
    expect(text('bridge')).toBe('connecting for 0.0 s');
    expect(text('no-systems')).toBe('No heartbeat heard yet.');
    expect(screen.queryByTestId('no-reconnect')).toBeNull();
    result.unmount();
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
});
