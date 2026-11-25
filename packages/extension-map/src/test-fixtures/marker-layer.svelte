<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { MAPLIBRE_CONTEXT_KEY } from './bridge-harness';

  // Draws as the flight overlay's marker layers do (home location, drone icon,
  // heading line): a MapLibre `Marker` added once the map exists, removed on
  // destroy.
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let marker: maplibregl.Marker | null = null;

  $effect(() => {
    const map = getMaplibre();
    if (!map || marker) return;
    const element = document.createElement('div');
    element.className = 'fixture-marker';
    marker = new maplibregl.Marker({ element }).setLngLat([149.17, -35.36]).addTo(map);
  });

  onDestroy(() => {
    marker?.remove();
    marker = null;
  });
</script>
