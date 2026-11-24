import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ControlsView from './controls-view.svelte';
import { setStationAddressSource } from './station-address';
import { FakeSocket, HELLO, advControls, inputText } from './test-fakes';

beforeEach(() => {
  FakeSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  setStationAddressSource(() => 'ws://127.0.0.1:8091/ws');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function live() {
  await vi.waitFor(() => expect(FakeSocket.instances.length).toBeGreaterThan(0));
  const socket = FakeSocket.latest();
  socket.receive(HELLO);
  return socket;
}

const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();
const rows = (container: HTMLElement, selector: string) =>
  [...container.querySelectorAll(`${selector} tbody tr`)].map((tr) =>
    [...tr.querySelectorAll('td')].map((td) => text(td)),
  );

describe('ControlsView', () => {
  it('shows every control by name, with the input it comes from', async () => {
    const { container } = render(ControlsView);
    const socket = await live();
    socket.receive(inputText([0], [true], 5, advControls()));

    await vi.waitFor(() => expect(screen.getByText('37%')).toBeTruthy());
    expect(text(container.querySelector('.profile'))).toBe(
      'profile gcscode-adv · TX16SMK3 Joystick',
    );
    expect(rows(container, '.axes')).toEqual([
      ['roll', '-12%', '', 'axis 0'],
      ['pitch', '0%', '', 'axis 1'],
      ['throttle', '37%', '', 'axis 2'],
      ['yaw', '100%', '', 'axis 3'],
      ['aux 1', '-100%', '', 'axis 4'],
      ['aux 2', '0%', '', 'axis 5'],
      ['aux 3', 'not mapped', '', ''],
      ['aux 4', 'not mapped', '', ''],
    ]);
    expect(rows(container, '.states')).toEqual([
      ['control', 'on', 'button 20'],
      ['RTL', 'not mapped', ''],
      ['SA', 'middle', 'buttons 0, 1, 2'],
      ['SF', 'unknown', 'buttons 15, 16'],
    ]);
    expect(text(container.querySelector('.unmapped-line'))).toBe(
      'unmapped axes: 6, 7 · unmapped buttons: 21, 22',
    );
  });

  it('draws throttle from the left and the others from the middle', async () => {
    const { container } = render(ControlsView);
    const socket = await live();
    socket.receive(inputText([0], [true], 5, advControls()));
    await vi.waitFor(() => expect(screen.getByText('37%')).toBeTruthy());
    const fills = [...container.querySelectorAll<HTMLElement>('.axes .fill')].map((f) => [
      f.style.left,
      f.style.width,
    ]);
    expect(fills).toEqual([
      ['44%', '6%'],
      ['50%', '0%'],
      ['0%', '37%'],
      ['50%', '50%'],
      ['0%', '50%'],
      ['50%', '0%'],
    ]);
    expect(container.querySelectorAll('.axes .mid')).toHaveLength(5);
  });

  it('marks a control that is on, and not one that is off', async () => {
    const { container } = render(ControlsView);
    const socket = await live();
    socket.receive(inputText([0], [true], 5, advControls()));
    await vi.waitFor(() => expect(container.querySelector('.state.on')).toBeTruthy());
    expect(text(container.querySelector('.state.on'))).toBe('on');

    const off = advControls({
      onOff: [
        { role: 'control', button: 20, on: false },
        { role: 'rtl', button: null, on: null },
      ],
    });
    socket.receive(inputText([0], [true], 5, off));
    await vi.waitFor(() => expect(screen.getByText('off')).toBeTruthy());
    expect(container.querySelector('.state.on')).toBeNull();
  });

  it('says when no profile matches the radio', async () => {
    render(ControlsView);
    const socket = await live();
    socket.receive(inputText([0, 0], [false, false, false], 5, null));
    await vi.waitFor(() =>
      expect(
        screen.getByText(
          /No profile matches this radio: TX16SMK3 Joystick 1209:4f54, 2 axes, 3 buttons\./,
        ),
      ).toBeTruthy(),
    );
  });

  it('says when the station has no radio, and when there is no station', async () => {
    render(ControlsView);
    const socket = await live();
    socket.receive('{"type":"input","radio":null,"controls":null,"eventsPerSecond":null}');
    await vi.waitFor(() =>
      expect(screen.getByText(/The station has no radio open\./)).toBeTruthy(),
    );
    socket.closeFromStation();
    await vi.waitFor(() =>
      expect(screen.getByText(/No station at ws:\/\/127\.0\.0\.1:8091\/ws\./)).toBeTruthy(),
    );
  });

  it('closes its socket when it is unmounted', async () => {
    const result = render(ControlsView);
    await live();
    result.unmount();
    expect(FakeSocket.latest().closeCalls).toBe(1);
  });
});
