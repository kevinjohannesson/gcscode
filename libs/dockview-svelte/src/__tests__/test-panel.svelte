<script lang="ts">
  import { onMount } from 'svelte';
  import type { IDockviewPanelProps } from 'dockview-core';

  // Generic panel-props shape — dockview-core passes { params, api, containerApi }.
  // `onMounted` is carried *inside* params so callers can pass it via
  // `addPanel({ params: { onMounted, ... } })`. The mountId is captured at
  // construction so tests can assert no-remount on update.
  type PanelParams = {
    title?: string;
    revision?: number;
    onMounted?: (mountId: string) => void;
  };

  let { params }: IDockviewPanelProps<PanelParams> = $props();

  const mountId = Math.random().toString(36).slice(2);
  onMount(() => params.onMounted?.(mountId));
</script>

<div data-testid="panel" data-mount-id={mountId}>
  <span data-testid="title">{params.title ?? '(no title)'}</span>
  <span data-testid="revision">{params.revision ?? 0}</span>
</div>
