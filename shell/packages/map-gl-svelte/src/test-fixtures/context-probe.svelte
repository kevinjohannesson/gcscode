<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { getMapContext } from '../components/map-context';

  let props: { onProbe?: (sawMap: boolean) => void; onDestroyed?: () => void } = $props();

  // During initialisation, which is when a child such as a Source adds itself to the map.
  const sawMap = getMapContext().map !== null;
  untrack(() => props.onProbe?.(sawMap));

  // For a test that the probe goes when what holds it does.
  onDestroy(() => props.onDestroyed?.());
</script>
