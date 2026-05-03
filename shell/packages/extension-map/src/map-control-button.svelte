<script lang="ts">
  import type { MapControlContribution } from './map-api.svelte';
  import { getHost } from './host-store';
  import LucideIcon from './lucide-icon.svelte';

  let { reg }: { reg: MapControlContribution } = $props();

  function onclick() {
    // Fire-and-forget. We don't surface command return value or errors
    // back to the contributor — see registerControl jsdoc.
    void getHost().commands.executeCommand(reg.commandId);
  }
</script>

<button
  class="map-control-button"
  type="button"
  title={reg.tooltip}
  aria-label={reg.tooltip}
  {onclick}
>
  {#if reg.icon.kind === 'lucide'}
    <LucideIcon name={reg.icon.name} size={16} />
  {:else}
    <!-- SAFE: extensions are first-party today; sandboxing is deferred. See
         docs/out-of-scope.md "Third-party sandboxing" + this iteration's
         "SVG sanitization" row. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html reg.icon.svg}
  {/if}
</button>

<style>
  .map-control-button {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    color: #333;
    cursor: pointer;
    padding: 0;
  }
  .map-control-button:hover {
    background: #f4f4f4;
  }
  .map-control-button:active {
    background: #e8e8e8;
  }
  .map-control-button :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
