// The station address `activate()` read from the setting, for the view to pick
// up when the shell mounts it. The shell renders a view's component bare, with
// no props and no host, so module state is how the two meet.
export const DEFAULT_STATION_URL = 'ws://127.0.0.1:8091/ws';

let address = DEFAULT_STATION_URL;

export function setStationAddress(url: string): void {
  address = url;
}

export function getStationAddress(): string {
  return address;
}
