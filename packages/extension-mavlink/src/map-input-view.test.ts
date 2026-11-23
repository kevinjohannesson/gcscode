// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MapInputView from './map-input-view.svelte';
import { vehicleInputs } from './vehicle-inputs.svelte';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  vehicleInputs.reset();
});
afterEach(() => {
  vehicleInputs.reset();
  vi.useRealTimers();
});

function frame(systemId: number, message: Record<string, unknown>): unknown {
  return { header: { system_id: systemId, component_id: 1, sequence: 0 }, message };
}

const cells = (testId: string) =>
  within(screen.getByTestId(testId))
    .getAllByRole('cell')
    .map((c) => c.textContent);

describe('MapInputView', () => {
  it('says nothing has arrived yet, and stops its clock when closed', () => {
    const result = render(MapInputView);
    expect(screen.getByTestId('merged').textContent).toContain('The map has no position yet.');
    expect(screen.getByText('No vehicle has sent a position or a home yet.')).toBeTruthy();
    result.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows each vehicle in its own row group, and a quiet one ages without going away', async () => {
    vehicleInputs.onMessage(
      frame(1, {
        type: 'GLOBAL_POSITION_INT',
        lat: -353632610,
        lon: 1491652300,
        relative_alt: 5400,
        hdg: 9000,
      }),
    );
    vehicleInputs.onMessage(
      frame(1, { type: 'HOME_POSITION', latitude: -353632621, longitude: 1491652374 }),
    );
    vehicleInputs.onMessage(
      frame(2, {
        type: 'GLOBAL_POSITION_INT',
        lat: -353640000,
        lon: 1491660000,
        relative_alt: 0,
        hdg: 18050,
      }),
    );

    render(MapInputView);

    expect(cells('Position-1')).toEqual([
      '-35.3632610, 149.1652300, 5.40 m',
      '0.0 s',
      '0.0 s',
      'GLOBAL_POSITION_INT from 1/1',
    ]);
    expect(cells('Heading-1')).toEqual([
      '90.00°',
      '0.0 s',
      '0.0 s',
      'GLOBAL_POSITION_INT from 1/1',
    ]);
    expect(cells('Home-1')).toEqual([
      '-35.3632621, 149.1652374',
      '0.0 s',
      '0.0 s',
      'HOME_POSITION from 1/1',
    ]);
    expect(cells('Position-2')).toEqual([
      '-35.3640000, 149.1660000, 0.00 m',
      '0.0 s',
      '0.0 s',
      'GLOBAL_POSITION_INT from 2/1',
    ]);
    expect(cells('Home-2')).toEqual(['—', '—', '—', 'not reported']);
    expect(screen.getByTestId('merged').textContent).toContain("system 2's position, 0.0 s ago");

    // Vehicle 1 keeps talking with the same position; vehicle 2 goes quiet.
    await vi.advanceTimersByTimeAsync(3_000);
    vehicleInputs.onMessage(
      frame(1, {
        type: 'GLOBAL_POSITION_INT',
        lat: -353632610,
        lon: 1491652300,
        relative_alt: 5400,
        hdg: 9000,
      }),
    );
    await vi.advanceTimersByTimeAsync(500);

    expect(screen.getByTestId('heard-1').textContent).toBe('last heard 0.5 s ago');
    expect(cells('Position-1').slice(1, 3)).toEqual(['0.5 s', '3.5 s']);
    expect(screen.getByTestId('heard-2').textContent).toBe('last heard 3.5 s ago');
    expect(cells('Position-2')).toEqual([
      '-35.3640000, 149.1660000, 0.00 m',
      '3.5 s',
      '3.5 s',
      'GLOBAL_POSITION_INT from 2/1',
    ]);
    expect(screen.getByTestId('merged').textContent).toContain("system 1's position, 0.5 s ago");
  });
});
