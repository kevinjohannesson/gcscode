<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { Map as GlMap, type ErrorEvent, type ViewStateChangeEvent } from 'map-gl-svelte';
  import { onDestroy, onMount } from 'svelte';

  import { TILE_STYLE } from './basemap';
  import { mapApi } from './map-api.svelte';
  import MapControlButton from './map-control-button.svelte';
  import MapReady from './map-ready.svelte';
  import RegisteredLayers from './registered-layers.svelte';

  let container: HTMLDivElement | undefined = $state();
  let glMap: GlMap | undefined = $state();
  // The raw MapLibre map, for the registered layers' bridge and the resize
  // below. `$state.raw`: a proxy around MapLibre's map would break it.
  let map: maplibregl.Map | null = $state.raw(null);
  let startFailed = $state(false);

  // Static list of corner positions iterated in the template. Declared once
  // here to avoid re-allocating an array tuple inside the {#each} key.
  const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

  // The camera is controlled: the library holds MapLibre to these props, and
  // a gesture reaches them only through `onMove`. A writer's change moves the
  // map once MapLibre is not moving, so it never stops the operator's drag.
  function onMove(event: ViewStateChangeEvent): void {
    const { longitude, latitude, zoom, pitch, bearing } = event.viewState;
    mapApi.camera.center = [longitude, latitude];
    mapApi.camera.zoom = zoom;
    mapApi.camera.pitch = pitch;
    mapApi.camera.bearing = bearing;
  }

  // The library sends MapLibre's start-up throw (no WebGL context, say) here
  // with `target: null`, and every `error` event of a running map, such as a
  // failed tile, with the map as target. Only the first gets the notice; both
  // are logged, as the library would log them without an `onError`.
  function onError(event: ErrorEvent): void {
    if (event.target === null) startFailed = true;
    console.error(event.error);
  }

  // MapLibre follows window resizes only; a dock panel resizes on its own
  // (a splitter drag, a group maximised), so the canvas follows its box.
  let resizeObserver: ResizeObserver | undefined;
  onMount(() => {
    if (!container) return;
    resizeObserver = new ResizeObserver(() => map?.resize());
    resizeObserver.observe(container);
  });
  onDestroy(() => resizeObserver?.disconnect());
</script>

<!-- Registered layers come first: siblings tear down in order, so each layer
     removes what it drew before the library's `Map` destroys the map. They
     mount outside the library's `Map`, so none reaches its components or
     context. -->
<RegisteredLayers getMap={() => map} />

<div class="map-view">
  <div class="map-view__canvas-wrapper">
    <div class="map-view__canvas" bind:this={container}>
      <GlMap
        bind:this={glMap}
        mapLib={maplibregl}
        mapStyle={TILE_STYLE}
        longitude={mapApi.camera.center[0]}
        latitude={mapApi.camera.center[1]}
        zoom={mapApi.camera.zoom}
        pitch={mapApi.camera.pitch}
        bearing={mapApi.camera.bearing}
        {onMove}
        {onError}
      >
        <MapReady onready={() => (map = glMap?.getMapRef()?.getMap() ?? null)} />
      </GlMap>
    </div>
    {#if startFailed}
      <p class="map-view__notice" role="status">The map could not start.</p>
    {/if}
    {#if map}
      {#each POSITIONS as pos (pos)}
        <div class="map-view__controls map-view__controls--{pos}">
          {#each [...mapApi.controls].filter(([, r]) => r.position === pos) as [id, reg] (id)}
            {#if 'commandId' in reg}
              <MapControlButton {reg} />
            {:else}
              {@const ControlComponent = reg.component}
              <ControlComponent />
            {/if}
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* The map fills its dock panel; the tab already names it. */
  .map-view,
  .map-view__canvas-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .map-view__canvas {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .map-view__notice {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    margin: 0;
    padding: 0.25rem 0.5rem;
    background: var(--gcscode-widget-background);
    border: 1px solid var(--gcscode-widget-border);
    border-radius: 4px;
    color: var(--gcscode-errorForeground);
  }
  .map-view__controls {
    position: absolute;
    display: flex;
    gap: 0.5rem;
    /* Slot wrapper ignores pointer events so empty corners don't block map
       drag/zoom across the whole top of the canvas. Children re-enable. */
    pointer-events: none;
  }
  .map-view__controls > :global(*) {
    pointer-events: auto;
  }
  .map-view__controls--top-left {
    top: 0.5rem;
    left: 0.5rem;
    flex-direction: column;
  }
  .map-view__controls--top-right {
    top: 0.5rem;
    right: 0.5rem;
    flex-direction: column;
  }
  /* Bottom corners use column-reverse so registration order = "first-
     registered closest to the anchor corner" — first control sits at the
     bottom; subsequent controls stack upward away from the corner. */
  .map-view__controls--bottom-left {
    bottom: 0.5rem;
    left: 0.5rem;
    flex-direction: column-reverse;
  }
  .map-view__controls--bottom-right {
    bottom: 0.5rem;
    right: 0.5rem;
    flex-direction: column-reverse;
  }
</style>
