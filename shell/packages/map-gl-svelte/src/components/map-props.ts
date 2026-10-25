import type { Snippet } from 'svelte';
import type { MaplibreProps } from '../maplibre/maplibre';
import type { MapLib, MapOptions } from '../types/lib';
import type { GlobalSettings } from '../utils/set-globals';

// In a `.ts` file rather than `map.svelte`, so `tsc` can see it.

type MapInitOptions = Omit<
  MapOptions,
  'style' | 'container' | 'bounds' | 'fitBoundsOptions' | 'center'
>;

export type MapProps = MapInitOptions &
  MaplibreProps &
  GlobalSettings & {
    mapLib?: MapLib | Promise<MapLib>;
    reuseMaps?: boolean;
    /** Map container id */
    id?: string;
    /** Map container CSS class */
    class?: string;
    /** Map container CSS style, after `position: relative; width: 100%; height: 100%` */
    style?: string;
    children?: Snippet;
  };
