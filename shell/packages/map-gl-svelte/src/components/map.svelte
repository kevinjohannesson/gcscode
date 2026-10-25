<script lang="ts">
  import { getContext, onMount, untrack } from 'svelte';
  import createRef, { type MapRef } from '../maplibre/create-ref';
  import Maplibre, { handlerNames, settingNames } from '../maplibre/maplibre';
  import type { ErrorEvent } from '../types/events';
  import type { MapLib } from '../types/lib';
  import { setGlobals } from '../utils/set-globals';
  import type { ConstraintRange } from '../utils/transform';
  import { setMapContext, type MapContextValue } from './map-context';
  import type { MapProps } from './map-props';
  import { MOUNTED_MAPS_CONTEXT_KEY, type MountedMapsContextValue } from './use-map.svelte';

  // The props object itself, never a copy: the wrapper reads it live (callbacks, camera hook).
  let props: MapProps = $props();

  let container: HTMLDivElement;
  let mapInstance: Maplibre | null = $state.raw(null);

  // Filled in when the map is created; descendants render only after that.
  const contextValue = { mapLib: null, map: null } as unknown as MapContextValue;
  setMapContext(contextValue);
  const mountedMaps = getContext<MountedMapsContextValue | undefined>(MOUNTED_MAPS_CONTEXT_KEY);

  // What the effects below diff against: each prop's value when last applied, starting from
  // the value the map was created with.
  const applied: Record<string, unknown> = {};
  const diffedProps = [
    ...settingNames,
    'minZoom',
    'maxZoom',
    'minPitch',
    'maxPitch',
    'cursor',
    'mapStyle',
    ...handlerNames,
  ] as const;

  // Spread, because the attribute isn't in Svelte's element typings. `recycle()` looks for it.
  const childContainerAttributes = { 'mapboxgl-children': '' };

  /** The map's `MapRef`, or `null` until the map exists. */
  export function getMapRef(): MapRef | null {
    return contextValue.map;
  }

  onMount(() => {
    // Read once, as upstream's mount effect closes over the first render's props.
    const { mapLib, reuseMaps, id } = props;
    let isMounted = true;
    let maplibre: Maplibre | null = null;

    const lib = (mapLib || import('maplibre-gl')) as MapLib | Promise<MapLib | { default: MapLib }>;
    Promise.resolve(lib)
      .then((module) => {
        if (!isMounted) {
          return;
        }
        if (!module) {
          throw new Error('Invalid mapLib');
        }
        const mapboxgl = 'Map' in module ? module : module.default;
        if (!mapboxgl.Map) {
          throw new Error('Invalid mapLib');
        }

        setGlobals(mapboxgl, props);
        if (reuseMaps) {
          maplibre = Maplibre.reuse(props, container);
        }
        if (!maplibre) {
          maplibre = new Maplibre(mapboxgl.Map, props, container);
        }
        // MapLibre appended its elements after the {#if} block's anchor. Move them in front, so
        // the children's element follows them as in upstream's DOM and stacks above the canvas.
        // Only MapLibre's own nodes move; Svelte's anchor and block keep their order.
        // eslint-disable-next-line svelte/no-dom-manipulating
        container.prepend(...container.children);
        for (const name of diffedProps) {
          applied[name] = props[name];
        }
        contextValue.map = createRef(maplibre)!;
        contextValue.mapLib = mapboxgl;

        mapInstance = maplibre;
        mountedMaps?.onMapMount(contextValue.map, id);
      })
      .catch((error: Error) => {
        const { onError } = props;
        if (onError) {
          onError({
            type: 'error',
            target: null,
            originalEvent: null,
            error,
          } as unknown as ErrorEvent);
        } else {
          console.error(error);
        }
      });

    return () => {
      isMounted = false;
      if (maplibre) {
        mountedMaps?.onMapUnmount(id);
        if (reuseMaps) {
          // Copies the props. During teardown Svelte reads them as they were before any change
          // not yet flushed, which is as the effects last applied them.
          maplibre.recycle();
        } else {
          maplibre.destroy();
        }
      }
    };
  });

  /**
   * One effect per MapLibre call: re-runs `apply` when the props `track` reads change, once the
   * map exists. MapLibre is called untracked, so callbacks it fires add no dependencies.
   */
  function sync(track: () => unknown, apply: (instance: Maplibre) => void): void {
    $effect(() => {
      track();
      const instance = mapInstance;
      if (instance) {
        untrack(() => apply(instance));
      }
    });
  }

  // In upstream's `setProps` order. Settings, limits, size and camera changes redraw (M10).
  for (const name of settingNames) {
    sync(
      () => props[name],
      (instance) => {
        if (instance.updateSetting(name, props[name], applied[name])) {
          instance.requestRedraw();
        }
        applied[name] = props[name];
      },
    );
  }
  sync(
    () => [props.minZoom, props.maxZoom],
    (instance) => {
      const { minZoom, maxZoom } = props;
      const prev = { min: applied.minZoom, max: applied.maxZoom } as ConstraintRange;
      if (instance.updateZoomConstraint({ min: minZoom, max: maxZoom }, prev)) {
        instance.requestRedraw();
      }
      Object.assign(applied, { minZoom, maxZoom });
    },
  );
  sync(
    () => [props.minPitch, props.maxPitch],
    (instance) => {
      const { minPitch, maxPitch } = props;
      const prev = { min: applied.minPitch, max: applied.maxPitch } as ConstraintRange;
      if (instance.updatePitchConstraint({ min: minPitch, max: maxPitch }, prev)) {
        instance.requestRedraw();
      }
      Object.assign(applied, { minPitch, maxPitch });
    },
  );
  sync(
    () => props.viewState,
    (instance) => {
      if (instance.updateSize()) {
        instance.requestRedraw();
      }
    },
  );
  sync(
    () => [
      props.longitude,
      props.latitude,
      props.zoom,
      props.pitch,
      props.bearing,
      props.padding,
      props.viewState,
    ],
    (instance) => {
      if (instance.updateViewState() && !instance.map.isMoving()) {
        instance.requestRedraw();
      }
    },
  );
  sync(
    () => props.cursor,
    (instance) => {
      if (props.cursor !== applied.cursor) {
        instance.updateCursor(props.cursor);
      }
      applied.cursor = props.cursor;
    },
  );
  sync(
    () => [props.mapStyle, props.styleDiffing],
    (instance) => {
      if (props.mapStyle !== applied.mapStyle) {
        instance.updateStyle(props.mapStyle, props.styleDiffing);
      }
      applied.mapStyle = props.mapStyle;
    },
  );
  sync(
    () => [props.light, props.sky, props.terrain, props.projection],
    (instance) => instance.updateStyleComponents(),
  );
  for (const name of handlerNames) {
    sync(
      () => props[name],
      (instance) => {
        instance.updateHandler(name, props[name], applied[name]);
        applied[name] = props[name];
      },
    );
  }
</script>

<div
  bind:this={container}
  id={props.id}
  class={props.class}
  style="position: relative; width: 100%; height: 100%; {props.style ?? ''}"
>
  {#if mapInstance}
    <div {...childContainerAttributes} style="height: 100%">
      {@render props.children?.()}
    </div>
  {/if}
</div>
