import type {
  ControlPosition,
  AttributionControlOptions,
  FullscreenControlOptions,
  GeolocateControlOptions,
  LogoControlOptions,
  NavigationControlOptions,
  ScaleControlOptions,
} from '../types/lib';
import type { GeolocateErrorEvent, GeolocateEvent, GeolocateResultEvent } from '../types/events';
import type { TerrainSpecification } from '../types/style-spec';
import type { CSSProperties } from '../utils/apply-style';

// The props of the eight built-in controls, in one `.ts` file rather than in the `.svelte`
// files, so `tsc` can see them.

/** What every control takes besides its MapLibre options. */
type ControlProps = {
  /** Placement of the control relative to the map. */
  position?: ControlPosition;
  /** CSS style override, applied to the control's container one property at a time */
  style?: CSSProperties;
};

export type AttributionControlProps = AttributionControlOptions & ControlProps;

export type FullscreenControlProps = Omit<FullscreenControlOptions, 'container'> &
  ControlProps & {
    /** Id of the DOM element which should be made full screen. By default, the map container
     * element will be made full screen. */
    containerId?: string;
  };

export type GeolocateControlProps = GeolocateControlOptions &
  ControlProps & {
    /** Called on each Geolocation API position update that returned as success. */
    onGeolocate?: (e: GeolocateResultEvent) => void;
    /** Called on each Geolocation API position update that returned as an error. */
    onError?: (e: GeolocateErrorEvent) => void;
    /** Called on each Geolocation API position update that returned as success but user position
     * is out of map `maxBounds`. */
    onOutOfMaxBounds?: (e: GeolocateResultEvent) => void;
    /** Called when the GeolocateControl changes to the active lock state. */
    onTrackUserLocationStart?: (e: GeolocateEvent) => void;
    /** Called when the GeolocateControl changes to the background state. */
    onTrackUserLocationEnd?: (e: GeolocateEvent) => void;
  };

export type GlobeControlProps = ControlProps;

export type LogoControlProps = LogoControlOptions & ControlProps;

export type NavigationControlProps = NavigationControlOptions & ControlProps;

export type ScaleControlProps = ScaleControlOptions &
  ControlProps & {
    // These props will be further constraint by the options type
    unit?: string;
    maxWidth?: number;
  };

export type TerrainControlProps = TerrainSpecification & ControlProps;
