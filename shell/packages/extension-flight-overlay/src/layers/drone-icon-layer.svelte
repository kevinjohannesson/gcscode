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
      // translate and the marker snaps to (0,0) of the map container.
      // Solution: maplibre owns the wrapper; we rotate a child rotor.
      const wrapper = document.createElement('div');
      rotor = document.createElement('div');
      rotor.className = 'gcscode-drone-icon';
      rotor.innerHTML = ARROW_SVG;
      wrapper.appendChild(rotor);
      marker = new maplibregl.Marker({ element: wrapper }).setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }

    const heading = sitl?.telemetry.heading ?? 0;
    const armed = sitl?.telemetry.armed === true;
    // No `transition: transform` — wraparound from 359°→0° would spin
    // the long way around the circle.
    rotor!.style.transform = `rotate(${heading}deg)`;
    rotor!.classList.toggle('armed', armed);
  });

  onDestroy(() => {
    marker?.remove();
    marker = null;
  });
</script>

<style>
  /* :global because the rotor lives inside maplibre's .maplibregl-marker
     wrapper, outside Svelte's scoped-CSS reach. The `gcscode-drone-icon`
     prefix prevents collisions across extensions. */
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
