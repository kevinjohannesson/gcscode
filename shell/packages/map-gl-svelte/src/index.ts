// Mirrors upstream `src/index.ts`; components and hooks are exported as later tasks add them.
import Map from './components/map.svelte';
export { Map };
export default Map;

export { default as Source } from './components/source.svelte';
export { default as Layer } from './components/layer.svelte';

export type { MapProps } from './components/map-props';
export type { MapRef } from './maplibre/create-ref';
export type { SourceProps } from './components/source-props';
export type { LayerProps } from './components/layer-props';

// Types
export * from './types/common';
export * from './types/events';
export * from './types/lib';
export * from './types/style-spec';
