<script lang="ts">
  import type { IWatermarkPanelProps } from 'dockview-svelte';

  // Rendered by dockview when no panels exist. Keeps the existing
  // data-testid="empty-state" so the test suite's empty-state assertions
  // continue to pass without modification.
  // Declare props to satisfy the watermark component signature.
  // The container API is not needed by the static empty-state UI.
  let { containerApi: _containerApi, group: _group }: IWatermarkPanelProps = $props();
</script>

<div class="flex h-full w-full items-center justify-center">
  <p data-testid="empty-state">No extensions registered.</p>
</div>
