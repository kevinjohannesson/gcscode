<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { computeCirclePolygon } from '../circle-polygon';
  import { homeLocation, maxDistanceMeters } from '../flight-overlay-config';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  const SOURCE_ID = 'gcscode.flight-overlay.max-distance.source';
  const LAYER_ID = 'gcscode.flight-overlay.max-distance.layer';

  let installed = false;

  function install(map: maplibregl.Map) {
    if (installed) return;
    if (map.getSource(SOURCE_ID)) return;

    const ring = computeCirclePolygon(homeLocation, maxDistanceMeters);
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      },
    });
    map.addLayer({
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': '#ef4444', 'line-width': 2 },
    });
    installed = true;
  }

  function uninstall(map: maplibregl.Map) {
    if (!installed) return;
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    installed = false;
  }

  $effect(() => {
    const map = getMaplibre();
    if (!map) return;

    // addSource / addLayer require the style to be loaded. If it's already
    // loaded, install immediately. Otherwise wait for the 'load' event once.
    if (map.isStyleLoaded()) {
      install(map);
    } else {
      const onLoad = () => install(map);
      map.once('load', onLoad);
      return () => {
        map.off('load', onLoad);
      };
    }
  });

  onDestroy(() => {
    const map = getMaplibre();
    if (map) uninstall(map);
  });
</script>
