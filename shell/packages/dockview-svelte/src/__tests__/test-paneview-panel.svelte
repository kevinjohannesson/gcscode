<script lang="ts">
  import { onMount } from 'svelte';
  import type { IPaneviewPanelProps } from '../paneview/types';

  type PanelParams = {
    title?: string;
    onMounted?: (mountId: string) => void;
  };

  let { params }: IPaneviewPanelProps<PanelParams> = $props();

  const mountId = Math.random().toString(36).slice(2);
  onMount(() => params.onMounted?.(mountId));
</script>

<div data-testid="pane-panel" data-mount-id={mountId}>
  <span data-testid="title">{params.title ?? '(no title)'}</span>
</div>
