<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import { MOUNTED_MAPS_CONTEXT_KEY, MountedMaps } from './use-map.svelte';

  let { children }: { children?: Snippet } = $props();

  // The maps inside register with it, by id, for `useMap()` to find.
  setContext(MOUNTED_MAPS_CONTEXT_KEY, new MountedMaps());
</script>

{@render children?.()}
