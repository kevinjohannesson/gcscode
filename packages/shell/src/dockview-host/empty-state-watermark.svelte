<script lang="ts">
  import type { IWatermarkPanelProps } from 'dockview-svelte';

  // Rendered by dockview when no panels exist. Keeps the existing
  // data-testid="empty-state" so the test suite's empty-state assertions
  // continue to pass without modification.
  // Declare props to satisfy the watermark component signature.
  // The container API is not needed by the static empty-state UI.
  let { containerApi: _containerApi, group: _group }: IWatermarkPanelProps = $props();
</script>

<!-- Shown whenever no extension contributes a view, most often because the
     operator disabled them all. "No extensions registered" read as broken in
     that case, so this names the way back instead. -->
<div class="flex h-full w-full items-center justify-center text-sm text-fg-muted">
  <div data-testid="empty-state" class="flex flex-col items-center gap-2 text-center">
    <p class="text-fg">No views open</p>
    <p>
      <kbd class="rounded border border-widget-border px-1 font-mono text-xs">Ctrl+Shift+X</kbd>
      to turn extensions on
    </p>
    <p>
      <kbd class="rounded border border-widget-border px-1 font-mono text-xs">Ctrl+Shift+P</kbd>
      for all commands
    </p>
  </div>
</div>
