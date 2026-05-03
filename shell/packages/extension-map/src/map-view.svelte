<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { onDestroy, onMount, setContext } from 'svelte';

  import { mapApi, MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';
  import MapControlButton from './map-control-button.svelte';

  let container: HTMLDivElement | undefined = $state();
  let map: maplibregl.Map | null = $state(null);

  // Loop guard: when our $effect writes camera state INTO maplibre, maplibre
  // fires a `move` event that would otherwise write right back, masking the
  // original write or causing spurious re-renders.
  let isUpdatingFromCamera = false;

  // Layer components access the maplibre Map via context. The getter form
  // (() => map) resolves `map` lazily — children mount before the parent's
  // onMount runs, so the value at setContext time is null. Layers read the
  // current value at $effect time. Plus we gate {#each} on `map` below to
  // avoid mounting layers before maplibre is ready.
  setContext(MAPLIBRE_CONTEXT_KEY, () => map);

  // OpenFreeMap "positron" — same tile source as map-demo. Free, no API key,
  // monochrome (operator-friendly), permitted for production.
  const TILE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

  // Static list of corner positions iterated in the template. Declared once
  // here to avoid re-allocating an array tuple inside the {#each} key.
  const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

  onMount(() => {
    if (!container) return;
    map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: mapApi.camera.center,
      zoom: mapApi.camera.zoom,
      pitch: mapApi.camera.pitch,
      bearing: mapApi.camera.bearing,
    });

    map.on('move', () => {
      if (!map || isUpdatingFromCamera) return;
      const c = map.getCenter();
      mapApi.camera.center = [c.lng, c.lat];
      mapApi.camera.zoom = map.getZoom();
      mapApi.camera.pitch = map.getPitch();
      mapApi.camera.bearing = map.getBearing();
    });
  });

  onDestroy(() => {
    map?.remove();
    map = null;
  });

  // Camera state → maplibre. Re-runs on any field change. Guarded against the
  // maplibre 'move' callback above.
  $effect(() => {
    if (!map) return;
    const { center, zoom, pitch, bearing } = mapApi.camera;
    isUpdatingFromCamera = true;
    map.jumpTo({ center, zoom, pitch, bearing });
    isUpdatingFromCamera = false;
  });
</script>

<div class="map-view">
  <h2 class="map-view__heading">Map</h2>
  <div class="map-view__canvas-wrapper">
    <div class="map-view__canvas" bind:this={container}></div>
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

{#if map}
  {#each [...mapApi.layers] as [id, entry] (id)}
    {@const Layer = entry.component}
    <Layer />
  {/each}
{/if}

<style>
  .map-view {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
  }
  .map-view__heading {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .map-view__canvas-wrapper {
    position: relative;
    width: 100%;
    height: 400px;
  }
  .map-view__canvas {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    overflow: hidden;
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
