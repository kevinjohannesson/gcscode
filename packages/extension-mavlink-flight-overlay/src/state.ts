import type { ExtensionHost } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';
import type { MavlinkExports } from '@gcscode/extension-mavlink';

/**
 * Module-level singleton holding a reference to the host. `mapExports` /
 * `mavlinkExports` getters route through it; reads inside `$derived` / `$effect`
 * auto-track the underlying `SvelteMap` (per ADR-0005).
 */
class FlightOverlayState {
  private _host: ExtensionHost | null = null;

  public setHost(host: ExtensionHost): void {
    this._host = host;
  }

  public clearHost(): void {
    this._host = null;
  }

  public get mapExports(): MapApi | undefined {
    return this._host?.extensions.getExtension<MapApi>('gcscode.map')?.exports;
  }

  public get mavlinkExports(): MavlinkExports | undefined {
    return this._host?.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports;
  }
}

export const flightOverlayState = new FlightOverlayState();
