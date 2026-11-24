// Where the views find the station's address and protocol when the shell mounts them. The
// shell renders a view's component bare, with no props and no host, so module
// state is how the two meet. `activate()` sets a reader rather than a value:
// the address is the MAVLink extension's setting (ADR-0015 Decision 3), and
// activation order is not guaranteed (ADR-0005), so it is read when the view
// opens, by which time every extension has registered its settings. The protocol
// is the MAVLink extension's one copy of it, read the same way from its exports;
// null means that extension is not loaded, so nothing says which protocol to expect.
export const DEFAULT_STATION_URL = 'ws://127.0.0.1:8091/ws';

let read: () => string = () => DEFAULT_STATION_URL;

export function setStationAddressSource(source: () => string): void {
  read = source;
}

export function getStationAddress(): string {
  return read();
}

let readProtocol: () => number | null = () => null;

export function setStationProtocolSource(source: () => number | null): void {
  readProtocol = source;
}

export function getStationProtocol(): number | null {
  return readProtocol();
}
