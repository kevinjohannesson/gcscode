import type maplibregl from 'maplibre-gl';

/** What the fixtures below saw of the raw-map bridge's context. */
export const bridge: {
  layerGetter: (() => maplibregl.Map | null) | undefined;
  controlContext: unknown;
} = { layerGetter: undefined, controlContext: undefined };

export const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';

export const FIXTURE_SOURCE_ID = 'fixture.source';
export const FIXTURE_LAYER_ID = 'fixture.layer';
