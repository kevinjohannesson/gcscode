<script lang="ts">
  import type maplibregl from 'maplibre-gl';
  import { setContext } from 'svelte';

  import { mapApi, MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';

  // The raw-map bridge, transitional and deprecated
  // (docs/specs/2026-11-25-map-on-map-gl-svelte.md, Goal 3). Only registered
  // layers get the context: it is set here, in a subtree of its own, so the
  // map's controls, which mount elsewhere in the view, never see it. The getter
  // returns `null` until the map exists, as it always has: a layer may mount
  // first and draws once its `$effect` reads a map.
  let { getMap }: { getMap: () => maplibregl.Map | null } = $props();

  setContext(MAPLIBRE_CONTEXT_KEY, () => getMap());
</script>

{#each [...mapApi.layers] as [id, entry] (id)}
  {@const Layer = entry.component}
  <Layer />
{/each}
