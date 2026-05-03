<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  // Re-declared string literal — public contract per @gcscode/extension-map
  // README. Do not runtime-import from sibling extensions (ADR-0005).
  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';

  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let marker: maplibregl.Marker | null = null;

  $effect(() => {
    const map = getMaplibre();
    if (!map) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    const sitl = flightOverlayState.sitlExports;
    if (!sitl) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    const { lat, lng } = sitl.telemetry;
    if (lat === null || lng === null) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    if (!marker) {
      marker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }
  });

  onDestroy(() => {
    if (marker) {
      marker.remove();
      marker = null;
    }
  });
</script>
