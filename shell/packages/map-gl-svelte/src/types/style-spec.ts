/*
 * Maplibre Style Specification types
 * Type names are aligned with mapbox
 */
import type { LayerSpecification } from 'maplibre-gl';

export type {
  // Layers
  LayerSpecification,

  // Sources
  SourceSpecification,
  VectorSourceSpecification,
  RasterSourceSpecification,
  RasterDEMSourceSpecification,
  GeoJSONSourceSpecification,
  VideoSourceSpecification,
  ImageSourceSpecification,
  CanvasSourceSpecification,

  // Style
  StyleSpecification,
  SkySpecification,
  LightSpecification,
  TerrainSpecification,
  ProjectionSpecification,
} from 'maplibre-gl';

// maplibre-gl 5 re-exports `LayerSpecification` but not the per-type layer specifications
// (upstream imports them from maplibre-gl 6), so derive them from the union.
export type FillLayerSpecification = Extract<LayerSpecification, { type: 'fill' }>;
export type LineLayerSpecification = Extract<LayerSpecification, { type: 'line' }>;
export type SymbolLayerSpecification = Extract<LayerSpecification, { type: 'symbol' }>;
export type CircleLayerSpecification = Extract<LayerSpecification, { type: 'circle' }>;
export type HeatmapLayerSpecification = Extract<LayerSpecification, { type: 'heatmap' }>;
export type FillExtrusionLayerSpecification = Extract<
  LayerSpecification,
  { type: 'fill-extrusion' }
>;
export type RasterLayerSpecification = Extract<LayerSpecification, { type: 'raster' }>;
export type HillshadeLayerSpecification = Extract<LayerSpecification, { type: 'hillshade' }>;
export type BackgroundLayerSpecification = Extract<LayerSpecification, { type: 'background' }>;
