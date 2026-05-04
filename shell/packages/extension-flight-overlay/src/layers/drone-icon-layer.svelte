<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  // Re-declared string literal — public contract per @gcscode/extension-map
  // README. Do not runtime-import from sibling extensions (ADR-0005).
  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';

  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  // Drawn pointing up (north) so heading=0 needs no offset rotation.
  const ARROW_SVG = `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M12 2 L20 22 L12 17 L4 22 Z" />
  </svg>`;

  let marker: maplibregl.Marker | null = null;
  let element: HTMLDivElement | null = null;

  $effect(() => {
    const map = getMaplibre();
    const sitl = flightOverlayState.sitlExports;
    const lat = sitl?.telemetry.lat ?? null;
    const lng = sitl?.telemetry.lng ?? null;

    if (!map || lat === null || lng === null) {
      marker?.remove();
      marker = null;
      element = null;
      return;
    }

    if (!marker) {
      element = document.createElement('div');
      element.className = 'gcscode-drone-icon';
      element.innerHTML = ARROW_SVG;
      marker = new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }

    const heading = sitl?.telemetry.heading ?? 0;
    const armed = sitl?.telemetry.armed === true;
    // No `transition: transform` — wraparound from 359°→0° would spin
    // the long way around the circle.
    element!.style.transform = `rotate(${heading}deg)`;
    element!.classList.toggle('armed', armed);
  });

  onDestroy(() => {
    marker?.remove();
    marker = null;
  });
</script>

<style>
  /* :global because the maplibre marker container is outside Svelte's
     scoped-CSS reach — the element gets re-parented into maplibre's
     `.maplibregl-marker` wrapper. The `gcscode-drone-icon` prefix
     prevents collisions across extensions. */
  :global(.gcscode-drone-icon) {
    color: #6b7280; /* gray-500, default = disarmed */
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  :global(.gcscode-drone-icon.armed) {
    color: #22c55e; /* green-500, aviation convention for active */
    fill: currentColor;
    stroke: none;
  }
</style>
