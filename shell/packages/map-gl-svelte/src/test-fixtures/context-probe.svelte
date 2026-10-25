<script lang="ts">
  import { untrack } from 'svelte';
  import { getMapContext } from '../components/map-context';

  let props: { onProbe?: (sawMap: boolean) => void } = $props();

  // During initialisation, which is when a child such as a Source adds itself to the map.
  const sawMap = getMapContext().map !== null;
  untrack(() => props.onProbe?.(sawMap));
</script>
