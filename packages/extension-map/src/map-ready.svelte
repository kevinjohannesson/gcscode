<script lang="ts">
  import { onMount } from 'svelte';

  // Rendered as the library `Map`'s only child, which it renders once the map
  // exists, so mounting here is the moment the map's ref is ready. Internal to
  // this package: nothing registered by another extension mounts inside the
  // library's `Map`.
  let { onready }: { onready: () => void } = $props();

  onMount(() => onready());
</script>
