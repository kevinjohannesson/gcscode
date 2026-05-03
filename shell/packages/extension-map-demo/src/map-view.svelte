<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { onDestroy, onMount } from 'svelte';

  import { getSitlExports } from './index';

  let container: HTMLDivElement | undefined = $state();
  let map: maplibregl.Map | null = null;
  let marker: maplibregl.Marker | null = null;

  // Initial camera fallback before any fix arrives. Matches the SITL test data
  // (Canberra) so the demo has a sensible default location even when the
  // simulator isn't running.
  const INITIAL_CENTER: [number, number] = [149.17, -35.36];
  const INITIAL_ZOOM = 13;

  // OpenFreeMap "positron" style. Free, no API key required, full-detail
  // vector tiles, monochrome (operator-friendly — doesn't compete visually
  // with markers). Permitted for development and production.
  // (Earlier draft used demotiles.maplibre.org, which is maplibre's own
  // dev-only fallback with countries-only detail — at zoom 13 it rendered
  // an empty canvas because no features intersect the city-level viewport.
  // OpenFreeMap has actual streets/buildings/labels.)
  const TILE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

  // Reactive read of SITL telemetry. When SITL is not active, exports is
  // undefined; when active but no fix yet, lat/lng are null.
  const telemetry = $derived(getSitlExports()?.telemetry);

  onMount(() => {
    if (!container) return;
    map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      // Pan and rotation disabled — auto-follow is the only camera-position
      // driver, so manual pan would just fight the next telemetry tick. Zoom
      // stays enabled so the operator can adjust scale without interfering
      // with follow behavior.
      dragPan: false,
      boxZoom: false,
      dragRotate: false,
      keyboard: false,
    });
    // Touch zoom-rotate has a rotation half that's enabled by default; silence
    // it for consistency with dragRotate: false. Pinch-zoom (the zoom half)
    // stays enabled.
    map.touchZoomRotate.disableRotation();
  });

  onDestroy(() => {
    if (marker) marker.remove();
    if (map) map.remove();
    marker = null;
    map = null;
  });

  // Single effect: marker + camera both update from telemetry. setCenter is
  // instant (no easing) because GLOBAL_POSITION_INT cadence at ~5 Hz would
  // stack easeTo animations and feel laggy. Marker and camera tracking in
  // lockstep makes the visual smooth without animation.
  $effect(() => {
    if (!map) return;
    const t = telemetry;
    if (!t || t.lat === null || t.lng === null) {
      // No fix or SITL inactive — remove the marker if it was placed.
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }
    if (!marker) {
      marker = new maplibregl.Marker().setLngLat([t.lng, t.lat]).addTo(map);
    } else {
      marker.setLngLat([t.lng, t.lat]);
    }
    map.setCenter([t.lng, t.lat]);
  });
</script>

<div class="map-view">
  <h2 class="map-view__heading">Map (demo)</h2>
  <div bind:this={container} class="map-view__canvas"></div>
</div>

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
  .map-view__canvas {
    width: 100%;
    height: 400px;
    border-radius: 4px;
    overflow: hidden;
  }
</style>
