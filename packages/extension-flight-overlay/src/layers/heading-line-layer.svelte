<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  // viewBox: x=[-4,4], y=[-400,0]. Line from (0,0) [SVG bottom-center,
  // drone position] to (0,-400) [SVG top-center, 400px in heading direction].
  // Width 8px gives the 2px stroke a small horizontal margin so antialiasing
  // stays clean.
  const LINE_SVG = `<svg viewBox="-4 -400 8 400" width="8" height="400">
    <line x1="0" y1="0" x2="0" y2="-400" stroke-width="2" />
  </svg>`;

  let marker: maplibregl.Marker | null = null;
  let rotor: HTMLDivElement | null = null;

  $effect(() => {
    const map = getMaplibre();
    const sitl = flightOverlayState.sitlExports;
    const lat = sitl?.telemetry.lat ?? null;
    const lng = sitl?.telemetry.lng ?? null;

    if (!map || lat === null || lng === null) {
      marker?.remove();
      marker = null;
      rotor = null;
      return;
    }

    if (!marker) {
      // maplibre's `Marker._update` writes its full transform stack
      // (anchor offset + translate + pitch + rotation alignment) directly
      // to the element it owns. Rotating that same element wipes the
      // translate and the marker snaps to (0,0). Solution: maplibre owns
      // the wrapper; we rotate a child rotor.
      const wrapper = document.createElement('div');
      // pointer-events: none cascades to the rotor + SVG. A 400px-long
      // marker shouldn't block map pan/zoom across its full reach.
      wrapper.style.pointerEvents = 'none';
      rotor = document.createElement('div');
      rotor.className = 'gcscode-drone-heading-line';
      rotor.innerHTML = LINE_SVG;
      wrapper.appendChild(rotor);
      // anchor: 'bottom' puts the wrapper's bottom-center at lat/lng,
      // which (because the SVG draws a line from its own bottom-center
      // upward) aligns the line's drone-end with the drone position.
      // CSS `transform-origin: 50% 100%` on the rotor makes rotation
      // pivot at that same drone-end so the line swings outward in the
      // heading direction instead of rotating around its midpoint.
      marker = new maplibregl.Marker({ element: wrapper, anchor: 'bottom' })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }

    const heading = sitl?.telemetry.heading;
    const armed = sitl?.telemetry.armed === true;
    const visible = armed && heading !== null && heading !== undefined;
    // display: none when hidden — cheaper than detach/reattach the
    // maplibre marker on every arm/disarm transition.
    rotor!.style.display = visible ? '' : 'none';
    rotor!.style.transform = `rotate(${heading ?? 0}deg)`;
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
    fill: none;
    /* Pivot rotation at the drone-end (rotor's bottom-center) so the
       line extends out from the drone in the heading direction rather
       than rotating around its midpoint. */
    transform-origin: 50% 100%;
  }
</style>
