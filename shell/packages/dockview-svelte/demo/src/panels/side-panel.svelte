<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { IDockviewPanelProps } from 'dockview-svelte';

  // Demonstrates pitfall #1: mount/unmount lifecycle hygiene.
  // Logs to the console on mount and unmount — if `unmount(instance)` is
  // not called by the bridge on dispose, the destroy log will not appear.
  let { params: _params, api }: IDockviewPanelProps = $props();

  onMount(() => {
    console.log(`[side-panel ${api.id}] mounted`);
  });

  onDestroy(() => {
    console.log(`[side-panel ${api.id}] destroyed`);
  });
</script>

<div class="panel">
  <h3>Side</h3>
  <p>Watch the console: mount/destroy logs verify the bridge calls unmount().</p>
  <p>panel id: <code>{api.id}</code></p>
</div>

<style>
  .panel {
    padding: 1rem;
    height: 100%;
    box-sizing: border-box;
    background: #252526;
    color: #f0f0f0;
  }
  h3 {
    margin: 0 0 0.75rem 0;
  }
  code {
    background: #1e1e1e;
    padding: 0.1rem 0.4rem;
    border-radius: 3px;
  }
</style>
