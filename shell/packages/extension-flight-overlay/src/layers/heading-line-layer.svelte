<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  // viewBox is centered horizontally at 0 with the line drawn from y=0
  // upward to y=-400. Width 8px (4px each side of the stroke) gives the
  // 2px stroke a small horizontal margin so antialiasing stays clean.
  const LINE_SVG = `<svg viewBox="-4 -400 8 400" width="8" height="400">
    <line x1="0" y1="0" x2="0" y2="-400" stroke-width="2" />
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
      element.className = 'gcscode-drone-heading-line';
      element.innerHTML = LINE_SVG;
      marker = new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }

    const heading = sitl?.telemetry.heading;
    const armed = sitl?.telemetry.armed === true;
    const visible = armed && heading !== null && heading !== undefined;
    // display: none when hidden — cheaper than detach/reattach the
    // maplibre marker on every arm/disarm transition.
    element!.style.display = visible ? '' : 'none';
    element!.style.transform = `rotate(${heading ?? 0}deg)`;
  });

  onDestroy(() => {
    marker?.remove();
    marker = null;
  });
</script>

<style>
  :global(.gcscode-drone-heading-line) {
    color: #22c55e; /* same green-500 as armed icon */
    stroke: currentColor;
    opacity: 0.7;
    /* No fill — line element doesn't take fill, but explicit for clarity. */
    fill: none;
    /* Don't intercept pointer events — the line shouldn't block map
       pan/zoom across its 400px length. */
    pointer-events: none;
  }
</style>
