<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import {
    FIXTURE_LAYER_ID as LAYER_ID,
    FIXTURE_SOURCE_ID as SOURCE_ID,
    MAPLIBRE_CONTEXT_KEY,
  } from './bridge-harness';

  // Draws as the flight overlay's max-distance circle does: a GeoJSON source
  // and a line layer, added once the style has loaded, removed on destroy.

  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let installed = false;

  function install(map: maplibregl.Map): void {
    if (installed || map.getSource(SOURCE_ID)) return;
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [149.17, -35.36] },
        properties: {},
      },
    });
    map.addLayer({ id: LAYER_ID, type: 'circle', source: SOURCE_ID });
    installed = true;
  }

  $effect(() => {
    const map = getMaplibre();
    if (!map) return;
    if (map.isStyleLoaded()) {
      install(map);
    } else {
      const onLoad = (): void => install(map);
      map.once('load', onLoad);
      return () => {
        map.off('load', onLoad);
      };
    }
  });

  onDestroy(() => {
    const map = getMaplibre();
    if (!map || !installed) return;
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    installed = false;
  });
</script>
