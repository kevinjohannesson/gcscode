import type { ExtensionHost } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';
import type { SitlExports } from '@gcscode/extension-sitl';

/**
 * Module-level singleton holding a reference to the host. `mapExports` /
 * `sitlExports` getters route through it; reads inside `$derived` / `$effect`
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

  public get sitlExports(): SitlExports | undefined {
    return this._host?.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports;
  }
}

export const flightOverlayState = new FlightOverlayState();
