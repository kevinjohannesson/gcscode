<script lang="ts">
  import type { ConfigurationStore } from '../configuration-store.svelte';

  let { store }: { store: ConfigurationStore } = $props();

  const label = $derived(store.getConfiguration('ext.a').get<string>('label', ''));
</script>

<span data-testid="label">{label}</span>
