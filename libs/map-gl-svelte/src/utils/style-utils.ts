import type { LayerSpecification, StyleSpecification } from '../types/style-spec';
import type { ImmutableLike } from '../types/common';

const refProps = ['type', 'source', 'source-layer', 'minzoom', 'maxzoom', 'filter', 'layout'];

/** Legacy layer fields that the typed style spec no longer carries. */
type LegacyLayer = LayerSpecification & { interactive?: boolean; ref?: string };

function isImmutableLike(
  style: StyleSpecification | ImmutableLike<StyleSpecification>,
): style is ImmutableLike<StyleSpecification> {
  return 'toJS' in style;
}

// Prepare a map style object for diffing
// If immutable - convert to plain object
// Work around some issues in older styles that would fail Mapbox's diffing
export function normalizeStyle(
  style: string | StyleSpecification | ImmutableLike<StyleSpecification> | null | undefined,
): string | StyleSpecification | null {
  if (!style) {
    return null;
  }
  if (typeof style === 'string') {
    return style;
  }
  const plainStyle = isImmutableLike(style) ? style.toJS() : style;
  if (!plainStyle.layers) {
    return plainStyle;
  }
  const layerIndex: Record<string, LegacyLayer> = {};

  for (const layer of plainStyle.layers) {
    layerIndex[layer.id] = layer;
  }

  const layers = plainStyle.layers.map((layer: LegacyLayer) => {
    let normalizedLayer: LegacyLayer | null = null;

    if ('interactive' in layer) {
      normalizedLayer = Object.assign({}, layer);
      // Breaks style diffing :(
      delete normalizedLayer.interactive;
    }

    // Style diffing doesn't work with refs so expand them out manually before diffing.
    const layerRef = layer.ref === undefined ? undefined : layerIndex[layer.ref];
    if (layerRef) {
      normalizedLayer = normalizedLayer || Object.assign({}, layer);
      delete normalizedLayer.ref;
      // https://github.com/mapbox/mapbox-gl-js/blob/master/src/style-spec/deref.js
      const target = normalizedLayer as Record<string, unknown>;
      const source = layerRef as Record<string, unknown>;
      for (const propName of refProps) {
        if (propName in layerRef) {
          target[propName] = source[propName];
        }
      }
    }

    return normalizedLayer || layer;
  });

  // Do not mutate the style object provided by the user
  return { ...plainStyle, layers };
}
