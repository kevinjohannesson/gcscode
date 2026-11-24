import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RadioInputView from './radio-input-view.svelte';
import { setStationAddress } from './station-address';
import { FakeSocket, HELLO, inputText } from './test-fakes';

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setStationAddress('ws://127.0.0.1:8091/ws');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function settle() {
  await vi.waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
}

describe('RadioInputView', () => {
  it('connects to the configured address and says so', async () => {
    setStationAddress('ws://127.0.0.1:9999/ws');
    render(RadioInputView);
    await settle();
    expect(FakeSocket.latest().url).toBe('ws://127.0.0.1:9999/ws');
    expect(screen.getByText('Connecting to the station at ws://127.0.0.1:9999/ws…')).toBeTruthy();
  });

  it('shows every raw value the station sends, as the probe does', async () => {
    const { container } = render(RadioInputView);
    await settle();
    const socket = FakeSocket.latest();
    socket.receive(HELLO);
    const buttons = Array.from({ length: 14 }, (_, i) => i === 7 || i === 9);
    socket.receive(inputText([0, -32768, 32767], buttons, 42));

    await vi.waitFor(() => expect(screen.getByText('pressed: 7, 9')).toBeTruthy());
    expect(container.querySelector('.radio')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'TX16SMK3 Joystick 1209:4f54 (EdgeTX radio)',
    );
    expect(screen.getByText('input events in the last second: 42')).toBeTruthy();

    const axisRows = [...container.querySelectorAll('.axes tbody tr')].map((tr) =>
      [...tr.querySelectorAll('.num')].map((td) => td.textContent),
    );
    expect(axisRows).toEqual([
      ['0', '0'],
      ['1', '-32768'],
      ['2', '32767'],
    ]);
    const fills = [...container.querySelectorAll<HTMLElement>('.axes .fill')].map((f) => [
      f.style.left,
      f.style.width,
    ]);
    expect(fills).toEqual([
      ['50%', '0%'],
      ['0%', '50%'],
      ['50%', '50%'],
    ]);

    const rows = [...container.querySelectorAll('.buttons tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent),
    );
    expect(rows).toEqual([
      ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'],
      ['12', '13'],
    ]);
    const pressed = [...container.querySelectorAll('.buttons td.pressed')].map(
      (td) => td.textContent,
    );
    expect(pressed).toEqual(['7', '9']);
  });

  it('says when the station has no radio, and when there is no station', async () => {
    render(RadioInputView);
    await settle();
    const socket = FakeSocket.latest();
    socket.receive(HELLO);
    socket.receive('{"type":"input","radio":null,"eventsPerSecond":null}');
    await vi.waitFor(() =>
      expect(screen.getByText(/The station has no radio open\./)).toBeTruthy(),
    );
    expect(screen.getByText('input events in the last second: (waiting for input)')).toBeTruthy();

    socket.closeFromStation();
    await vi.waitFor(() =>
      expect(screen.getByText(/No station at ws:\/\/127\.0\.0\.1:8091\/ws\./)).toBeTruthy(),
    );
    expect(screen.getByText(`--allow-origin ${location.origin}`)).toBeTruthy();
  });

  it('closes its socket when it is unmounted', async () => {
    const result = render(RadioInputView);
    await settle();
    result.unmount();
    expect(FakeSocket.latest().closeCalls).toBe(1);
  });
});
