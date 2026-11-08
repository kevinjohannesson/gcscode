<script lang="ts">
  import type { IWatermarkPanelProps } from 'dockview-core';

  // The watermark renderer mounts this component when no panels are present.
  // We render a sentinel for tests, plus a pin to the containerApi to keep
  // typescript-aware unused-checks happy.
  const props: IWatermarkPanelProps = $props();
  const containerId = $derived(props.containerApi ? 'has-api' : 'no-api');
</script>

<div data-testid="watermark" data-container={containerId}>no panels</div>
