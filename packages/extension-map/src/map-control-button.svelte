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
    background: var(--gcscode-widget-background);
    border: 1px solid var(--gcscode-widget-border);
    border-radius: 4px;
    box-shadow: 0 1px 4px var(--gcscode-widget-shadow);
    color: var(--gcscode-foreground);
    cursor: pointer;
    padding: 0;
  }
  .map-control-button:hover {
    background: var(--gcscode-toolbar-hoverBackground);
  }
  .map-control-button:active {
    background: var(--gcscode-toolbar-activeBackground);
  }
  .map-control-button :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
