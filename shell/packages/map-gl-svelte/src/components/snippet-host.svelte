<script lang="ts">
  import type { Snippet } from 'svelte';

  // Mounted into an element a component owns (a marker's, a popup's), which stands in for
  // upstream's `createPortal`. The mounting component unmounts it.
  let { snippet }: { snippet: Snippet } = $props();
</script>

{@render snippet()}
