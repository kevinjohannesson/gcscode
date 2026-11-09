<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { homeLocation } from '../flight-overlay-config';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let marker: maplibregl.Marker | null = null;

  $effect(() => {
    const map = getMaplibre();
    if (!map) return;

    if (!marker) {
      // Distinct color so home is visually different from the drone icon.
      marker = new maplibregl.Marker({ color: '#3b82f6' }).setLngLat(homeLocation).addTo(map);
    }
  });

  onDestroy(() => {
    if (marker) {
      marker.remove();
      marker = null;
    }
  });
</script>
