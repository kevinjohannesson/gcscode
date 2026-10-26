<script lang="ts">
  import { untrack } from 'svelte';

  let props: { setup: () => void } = $props();

  // Called now, during initialisation, which is when `useControl` must be called.
  untrack(() => props.setup());
</script>
