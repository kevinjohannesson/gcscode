// A stand-in for the browser's WebSocket. Not part of the package's public surface.
import type { StationSocket } from './radio-input-state.svelte';
import type { Controls } from './station-protocol';

export class FakeSocket implements StationSocket {
  static instances: FakeSocket[] = [];

  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closeCalls = 0;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  static latest(): FakeSocket {
    const s = FakeSocket.instances.at(-1);
    if (!s) throw new Error('no socket opened');
    return s;
  }

  close(): void {
    this.closeCalls++;
  }

  /** The station sends a message. */
  receive(text: string): void {
    this.onmessage?.({ data: text } as MessageEvent);
  }

  /** The connection ends from the station's side, or fails. */
  closeFromStation(): void {
    this.onclose?.({} as CloseEvent);
  }
}

export const HELLO = '{"type":"hello","protocol":1,"station":"0.1.0"}';

export function inputText(
  axes: number[],
  buttons: boolean[],
  eventsPerSecond: number | null = 5,
  controls: Controls | null = null,
) {
  return JSON.stringify({
    type: 'input',
    radio: {
      name: 'TX16SMK3 Joystick',
      vendorId: 0x1209,
      productId: 0x4f54,
      serial: '0123456789AB',
      axes,
      buttons,
      hats: [],
    },
    controls,
    eventsPerSecond,
  });
}

/** The TX16S on its gcscode-adv model, as the station maps it. */
export function advControls(overrides: Partial<Controls> = {}): Controls {
  const ups = ['up', 'middle', 'down'];
  return {
    profile: 'gcscode-adv',
    axes: [
      { role: 'roll', axis: 0, percent: -12 },
      { role: 'pitch', axis: 1, percent: 0 },
      { role: 'throttle', axis: 2, percent: 37 },
      { role: 'yaw', axis: 3, percent: 100 },
      { role: 'aux1', axis: 4, percent: -100 },
      { role: 'aux2', axis: 5, percent: 0 },
      { role: 'aux3', axis: null, percent: null },
      { role: 'aux4', axis: null, percent: null },
    ],
    onOff: [
      { role: 'control', button: 20, on: true },
      { role: 'rtl', button: null, on: null },
    ],
    switches: [
      { name: 'SA', buttons: [0, 1, 2], positions: ups, position: 'middle' },
      { name: 'SF', buttons: [15, 16], positions: ['up', 'down'], position: null },
    ],
    unmappedAxes: [6, 7],
    unmappedButtons: [21, 22],
    ...overrides,
  };
}
