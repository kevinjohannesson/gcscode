<script module lang="ts">
  import type { AddLayerObject } from 'maplibre-gl';
  import type { MapInstance } from '../types/lib';
  import { deepEqual } from '../utils/deep-equal';
  import type { LayerProps } from './layer-props';

  type Properties = Record<string, unknown> | undefined;

  let layerCounter = 0;

  /** The layer types MapLibre adds without a source. */
  const SOURCELESS_TYPES = ['background', 'custom'];

  /** An id for a Layer given none. Upstream's are `jsx-layer-N`. */
  function generateId(): string {
    return `svelte-layer-${layerCounter++}`;
  }

  /**
   * Whether the layer can be added now: a layer of a type that needs a source waits until it has
   * a source id, and that source is on the map. Upstream waits for `source={undefined}` too
   * (`'source' in props`), which Svelte can't tell from an absent `source`.
   */
  function canAdd(map: MapInstance, type: string, source: string | undefined): boolean {
    return source === undefined ? SOURCELESS_TYPES.includes(type) : Boolean(map.getSource(source));
  }

  function createLayer(
    map: MapInstance,
    id: string,
    props: LayerProps,
    source: string | undefined,
  ): void {
    if (map.style && map.style._loaded && canAdd(map, props.type, source)) {
      const options: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        // Svelte passes an unset prop as a present `undefined`, which MapLibre's validation
        // rejects for `paint`, `layout` and `filter`.
        if (value !== undefined && key !== 'beforeId') {
          options[key] = value;
        }
      }
      options.id = id;
      if (source !== undefined) {
        options.source = source;
      }
      map.addLayer(options as AddLayerObject, props.beforeId);
    }
  }

  /** Sets each key of `next` that differs from `prev`, and resets each key `next` lacks. */
  function updateProperties(
    next: Properties,
    prev: Properties,
    set: (key: string, value: unknown) => void,
  ): void {
    const nextProperties = next || {};
    const prevProperties = prev || {};
    for (const key in nextProperties) {
      if (!deepEqual(nextProperties[key], prevProperties[key])) {
        set(key, nextProperties[key]);
      }
    }
    for (const key in prevProperties) {
      if (!Object.hasOwn(nextProperties, key)) {
        set(key, undefined);
      }
    }
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { assert } from '../utils/assert';
  import { getMapContext } from './map-context';
  import { getSourceId } from './source-context';

  let props: LayerProps = $props();

  const map = getMapContext().map.getMap();
  const contextSourceId = getSourceId();
  const id = untrack(() => props.id) || generateId();

  /** Reads a prop that not every layer type has (`source`, `paint`, `filter`, …). */
  function read(key: string): unknown {
    return (props as Record<string, unknown>)[key];
  }

  // An explicit `source` wins over the enclosing Source's id. Either way the layer finds the
  // source through the map, by id (M17).
  const source = $derived((read('source') as string | undefined) ?? contextSourceId);

  // Bumped on every `styledata`, so the creation effect re-checks the style (M18).
  let styleVersion = $state(0);

  $effect(() => {
    // Not deferred, as upstream.
    const forceUpdate = () => {
      styleVersion++;
    };
    map.on('styledata', forceUpdate);

    return () => {
      map.off('styledata', forceUpdate);
      if (map.style && map.style._loaded && map.getLayer(id)) {
        map.removeLayer(id);
      }
    };
  });

  // Adds the layer if the style lacks it, once the style is loaded and has the source (M16).
  $effect(() => {
    void styleVersion;
    const sourceId = source;
    untrack(() => {
      if (!(map.style && map.getLayer(id))) {
        createLayer(map, id, props, sourceId);
      }
    });
  });

  // What the update effects diff against: each prop's value when last seen.
  const applied: Record<string, unknown> = untrack(() => ({ ...props }));

  /**
   * Applies an update to the layer, if it's in the style and isn't a custom layer. Errors are
   * warned rather than thrown, as upstream's `try` around its updates.
   */
  function update(apply: () => void): void {
    const layer = map.style && map.getLayer(id);
    if (!layer || layer.type === 'custom' || props.type === 'custom') {
      return;
    }
    try {
      apply();
    } catch (error) {
      console.warn(error);
    }
  }

  // Changing a layer's id or type is an error, warned as upstream does (M19).
  $effect(() => {
    const nextId = props.id;
    const type = props.type;
    untrack(() => {
      if (map.style && map.getLayer(id)) {
        try {
          assert(nextId === applied.id, 'layer id changed');
          assert(type === applied.type, 'layer type changed');
        } catch (error) {
          console.warn(error);
        }
      }
      applied.id = nextId;
      applied.type = type;
    });
  });

  $effect(() => {
    const beforeId = props.beforeId;
    untrack(() => {
      if (beforeId !== applied.beforeId) {
        update(() => map.moveLayer(id, beforeId));
      }
      applied.beforeId = beforeId;
    });
  });

  $effect(() => {
    const layout = read('layout') as Properties;
    untrack(() => {
      if (layout !== applied.layout) {
        update(() =>
          updateProperties(layout, applied.layout as Properties, (key, value) =>
            map.setLayoutProperty(id, key, value),
          ),
        );
      }
      applied.layout = layout;
    });
  });

  $effect(() => {
    const paint = read('paint') as Properties;
    untrack(() => {
      if (paint !== applied.paint) {
        update(() =>
          updateProperties(paint, applied.paint as Properties, (key, value) =>
            map.setPaintProperty(id, key, value),
          ),
        );
      }
      applied.paint = paint;
    });
  });

  $effect(() => {
    const filter = read('filter');
    untrack(() => {
      if (!deepEqual(filter, applied.filter)) {
        update(() => map.setFilter(id, filter as Parameters<MapInstance['setFilter']>[1]));
      }
      applied.filter = filter;
    });
  });

  $effect(() => {
    const minzoom = read('minzoom') as number;
    const maxzoom = read('maxzoom') as number;
    untrack(() => {
      if (minzoom !== applied.minzoom || maxzoom !== applied.maxzoom) {
        update(() => map.setLayerZoomRange(id, minzoom, maxzoom));
      }
      applied.minzoom = minzoom;
      applied.maxzoom = maxzoom;
    });
  });
</script>
