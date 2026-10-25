export type GlobalSettings = {
  /** The maximum number of images (raster tiles, sprites, icons) to load in parallel.
   * @default 16
   */
  maxParallelImageRequests?: number;
  /** The map's RTL text plugin. Necessary for supporting the Arabic and Hebrew languages, which are written right-to-left.  */
  RTLTextPlugin?: string | { pluginUrl: string; lazy?: boolean };
  /** The number of web workers instantiated on a page with maplibre-gl maps.
   * @default 2
   */
  workerCount?: number;
  /** Provides an interface for loading maplibre-gl's WebWorker bundle from a self-hosted URL.
   * This is useful if your site needs to operate in a strict CSP (Content Security Policy) environment
   * wherein you are not allowed to load JavaScript code from a Blob URL, which is default behavior. */
  workerUrl?: string;
};

/**
 * The part of the maplibre-gl module that `setGlobals` calls. `MapLib` (the minimal Mapbox and
 * MapLibre intersection) doesn't describe these, so `setGlobals` takes any object and reads them
 * off it, as upstream does with `any`.
 */
type GlobalsMapLib = {
  getRTLTextPluginStatus?: () => string;
  setRTLTextPlugin: (
    pluginUrl: string,
    callback: (error?: Error) => void,
    deferred?: boolean,
  ) => unknown;
  setMaxParallelImageRequests: (value: number) => void;
  setWorkerCount: (value: number) => void;
  setWorkerUrl: (value: string) => void;
};

export function setGlobals(mapLib: object, props: GlobalSettings): void {
  const lib = mapLib as GlobalsMapLib;
  const { RTLTextPlugin, maxParallelImageRequests, workerCount, workerUrl } = props;
  if (
    RTLTextPlugin &&
    lib.getRTLTextPluginStatus &&
    lib.getRTLTextPluginStatus() === 'unavailable'
  ) {
    const { pluginUrl, lazy = true } =
      typeof RTLTextPlugin === 'string' ? { pluginUrl: RTLTextPlugin } : RTLTextPlugin;

    lib.setRTLTextPlugin(
      pluginUrl,
      (error?: Error) => {
        if (error) {
          console.error(error);
        }
      },
      lazy,
    );
  }
  if (maxParallelImageRequests !== undefined) {
    lib.setMaxParallelImageRequests(maxParallelImageRequests);
  }
  if (workerCount !== undefined) {
    lib.setWorkerCount(workerCount);
  }
  if (workerUrl !== undefined) {
    lib.setWorkerUrl(workerUrl);
  }
}
