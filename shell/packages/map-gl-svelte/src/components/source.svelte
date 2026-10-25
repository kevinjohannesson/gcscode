<script module lang="ts">
  import type {
    AnySourceImplementation,
    GeoJSONSourceImplementation,
    ImageSourceImplementation,
  } from '../types/internal';
  import type { MapInstance } from '../types/lib';
  import type { SourceSpecification } from '../types/style-spec';
  import { assert } from '../utils/assert';
  import { deepEqual } from '../utils/deep-equal';
  import type { SourceProps } from './source-props';

  type Options = Record<string, unknown>;

  let sourceCounter = 0;

  /** An id for a Source given none. Upstream's are `jsx-source-N`. */
  function generateId(): string {
    return `svelte-source-${sourceCounter++}`;
  }

  /** The props other than `children` and `data`, each read through `props`, so tracked. */
  function readOptions(props: SourceProps): Options {
    const options: Options = {};
    for (const key of Object.keys(props)) {
      if (key !== 'children' && key !== 'data') {
        options[key] = props[key as keyof SourceProps];
      }
    }
    return options;
  }

  function createSource(map: MapInstance, id: string, props: SourceProps) {
    if (map.style && map.style._loaded) {
      const options = { ...props } as Options;
      delete options.id;
      delete options.children;
      map.addSource(id, options as SourceSpecification);
      return map.getSource(id);
    }
    return null;
  }

  /** Upstream's `updateSource`, for every prop but `data`, which has an effect of its own. */
  function updateSource(
    source: AnySourceImplementation,
    props: Options,
    prevProps: Options,
    data: unknown,
  ): void {
    assert(props.id === prevProps.id, 'source id changed');
    assert(props.type === prevProps.type, 'source type changed');

    let changedKey = '';
    let changedKeyCount = 0;

    for (const key in props) {
      if (key !== 'id' && !deepEqual(prevProps[key], props[key])) {
        changedKey = key;
        changedKeyCount++;
      }
    }

    if (!changedKeyCount) {
      return;
    }

    const type = props.type;

    if (type === 'geojson') {
      (source as GeoJSONSourceImplementation).setData(
        data as Parameters<GeoJSONSourceImplementation['setData']>[0],
      );
    } else if (type === 'image') {
      (source as ImageSourceImplementation).updateImage({
        url: props.url as string,
        coordinates: props.coordinates as Parameters<
          ImageSourceImplementation['setCoordinates']
        >[0],
      });
    } else {
      const setters = source as Partial<{
        setCoordinates(coordinates: unknown): void;
        setUrl(url: unknown): void;
        setTiles(tiles: unknown): void;
      }>;
      switch (changedKey) {
        case 'coordinates':
          setters.setCoordinates?.(props.coordinates);
          break;
        case 'url':
          setters.setUrl?.(props.url);
          break;
        case 'tiles':
          setters.setTiles?.(props.tiles);
          break;
        default:
          console.warn(`Unable to update <Source> prop: ${changedKey}`);
      }
    }
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { getMapContext } from './map-context';
  import { setSourceId } from './source-context';

  let props: SourceProps = $props();

  const map = getMapContext().map.getMap();
  const id = untrack(() => props.id) || generateId();
  // The id only, never this component: a Layer finds the source through the map (M17).
  setSourceId(id);

  // Bumped on every `styledata`, so the creation effect re-checks the style (M18).
  let styleVersion = $state(0);
  // Children render only while the source exists (M15).
  let hasSource = $state(false);

  $effect(() => {
    // Deferred a task, as upstream.
    const forceUpdate = () => setTimeout(() => styleVersion++, 0);
    map.on('styledata', forceUpdate);

    return () => {
      map.off('styledata', forceUpdate);
      if (map.style && map.style._loaded && map.getSource(id)) {
        // The source can't be removed while a layer uses it, so remove those first (M20).
        const allLayers = map.getStyle()?.layers;
        if (allLayers) {
          for (const layer of allLayers) {
            if ('source' in layer && layer.source === id) {
              map.removeLayer(layer.id);
            }
          }
        }
        map.removeSource(id);
      }
    };
  });

  // Adds the source if the style lacks it and is loaded; does nothing if it isn't yet (M16).
  $effect(() => {
    void styleVersion;
    untrack(() => {
      hasSource = Boolean((map.style && map.getSource(id)) || createSource(map, id, props));
    });
  });

  // GeoJSON `data`: `setData` whenever a different object is passed. Compared by reference, not
  // deep equality, so an in-place change isn't seen.
  let appliedData = untrack(() => ('data' in props ? props.data : undefined));
  $effect(() => {
    const data = 'data' in props ? props.data : undefined;
    untrack(() => {
      if (data !== appliedData) {
        const source = map.style && map.getSource(id);
        if (source && props.type === 'geojson') {
          (source as GeoJSONSourceImplementation).setData(
            data as Parameters<GeoJSONSourceImplementation['setData']>[0],
          );
        }
      }
      appliedData = data;
    });
  });

  // Every other prop, diffed against its last value (M19).
  let appliedOptions = untrack(() => readOptions(props));
  $effect(() => {
    const options = readOptions(props);
    untrack(() => {
      const source = map.style && map.getSource(id);
      if (source) {
        updateSource(source, options, appliedOptions, 'data' in props ? props.data : undefined);
      }
      appliedOptions = options;
    });
  });
</script>

{#if hasSource}
  {@render props.children?.()}
{/if}
