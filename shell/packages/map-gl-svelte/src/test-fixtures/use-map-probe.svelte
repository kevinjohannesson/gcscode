<script lang="ts">
  import { untrack } from 'svelte';
  import type { MapCollection } from '../components/use-map.svelte';
  // From the package entry point, so the tests exercise the public exports.
  import { useMap } from '../index';

  let props: {
    /** Tells the probes apart in `onMaps` and in the DOM. */
    name: string;
    /** An id whose registration is shown. */
    watch?: string;
    /** Receives what `useMap()` returned, to inspect it outside the template. */
    onMaps?: (name: string, maps: MapCollection) => void;
  } = $props();

  // During initialisation, as `useMap()` requires. Used as it is, never destructured.
  const maps = useMap();
  untrack(() => props.onMaps?.(props.name, maps));
</script>

<p data-probe={props.name}>
  <span class="watch">{maps[props.watch ?? ''] ? 'yes' : 'no'}</span>
  <span class="current">{maps.current ? 'yes' : 'no'}</span>
  <span class="keys">{Object.keys(maps).join(',')}</span>
</p>
