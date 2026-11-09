// The address `activate()` read from the setting, for the panel to pick up when
// the shell mounts it. The shell renders a view's component bare, with no
// props and no host, so module state is how the two meet.
export const DEFAULT_WHEP_URL = 'http://localhost:8889/drone-1/whep';

let address = DEFAULT_WHEP_URL;

export function setVideoAddress(url: string): void {
  address = url;
}

export function getVideoAddress(): string {
  return address;
}
