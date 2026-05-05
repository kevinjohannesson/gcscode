<script lang="ts">
  import { onMount } from 'svelte';
  import type { ISplitviewPanelProps } from '../splitview/types';

  type PanelParams = {
    title?: string;
    onMounted?: (mountId: string) => void;
  };

  let { params }: ISplitviewPanelProps<PanelParams> = $props();

  const mountId = Math.random().toString(36).slice(2);
  onMount(() => params.onMounted?.(mountId));
</script>

<div data-testid="split-panel" data-mount-id={mountId}>
  <span data-testid="title">{params.title ?? '(no title)'}</span>
</div>
