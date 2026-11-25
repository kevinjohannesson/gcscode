<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { getContext } from 'svelte';

  import { bridge, MAPLIBRE_CONTEXT_KEY } from './bridge-harness';

  // A registered layer that only records the bridge's getter, so a test can
  // reach the raw map the way the flight overlay's layers do.
  bridge.layerGetter = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
</script>
