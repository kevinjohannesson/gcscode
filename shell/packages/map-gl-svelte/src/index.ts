// Mirrors upstream `src/index.ts`; components and hooks are exported as later tasks add them.
import Map from './components/map.svelte';
export { Map };
export default Map;

export { default as Source } from './components/source.svelte';
export { default as Layer } from './components/layer.svelte';
export { default as Marker } from './components/marker.svelte';
export { default as Popup } from './components/popup.svelte';

export type { MapProps } from './components/map-props';
export type { MapRef } from './maplibre/create-ref';
export type { SourceProps } from './components/source-props';
export type { LayerProps } from './components/layer-props';
export type { MarkerProps } from './components/marker-props';
export type { PopupProps } from './components/popup-props';

// Types
export * from './types/common';
export * from './types/events';
export * from './types/lib';
export * from './types/style-spec';
