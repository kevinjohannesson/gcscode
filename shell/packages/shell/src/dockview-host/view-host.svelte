<script lang="ts">
  import type { Component } from 'svelte';
  import type { IDockviewPanelProps } from 'dockview-svelte';

  type Params = { component?: Component };

  // We accept the full dockview panel-props shape but only consume `params`.
  // `api` and `containerApi` are passed through by dockview and ignored here.
  let { params }: IDockviewPanelProps<Params> = $props();

  // Local binding captures the reactive component reference for the markup.
  const ViewComponent = $derived(params.component);
</script>

{#if ViewComponent}
  <ViewComponent />
{/if}
