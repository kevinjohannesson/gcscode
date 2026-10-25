// Mirrors upstream `src/index.ts`; components and hooks are exported as later tasks add them.
import Map from './components/map.svelte';
export { Map };
export default Map;

export { default as Source } from './components/source.svelte';
export { default as Layer } from './components/layer.svelte';
export { default as Marker } from './components/marker.svelte';
export { default as Popup } from './components/popup.svelte';
export { default as AttributionControl } from './components/attribution-control.svelte';
export { default as FullscreenControl } from './components/fullscreen-control.svelte';
export { default as GeolocateControl } from './components/geolocate-control.svelte';
export { default as GlobeControl } from './components/globe-control.svelte';
export { default as LogoControl } from './components/logo-control.svelte';
export { default as NavigationControl } from './components/navigation-control.svelte';
export { default as ScaleControl } from './components/scale-control.svelte';
export { default as TerrainControl } from './components/terrain-control.svelte';
export { useControl } from './components/use-control';

export type { MapProps } from './components/map-props';
export type { MapRef } from './maplibre/create-ref';
export type { SourceProps } from './components/source-props';
export type { LayerProps } from './components/layer-props';
export type { MarkerProps } from './components/marker-props';
export type { PopupProps } from './components/popup-props';
export type {
  AttributionControlProps,
  FullscreenControlProps,
  GeolocateControlProps,
  GlobeControlProps,
  LogoControlProps,
  NavigationControlProps,
  ScaleControlProps,
  TerrainControlProps,
} from './components/control-props';

// Types
export * from './types/common';
export * from './types/events';
export * from './types/lib';
export * from './types/style-spec';
