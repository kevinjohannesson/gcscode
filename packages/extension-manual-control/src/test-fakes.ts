// A stand-in for the browser's WebSocket. Not part of the package's public surface.
import type { StationSocket } from './radio-input-state.svelte';

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

export const HELLO = '{"type":"hello","protocol":0,"station":"0.1.0"}';

export function inputText(axes: number[], buttons: boolean[], eventsPerSecond: number | null = 5) {
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
    eventsPerSecond,
  });
}
