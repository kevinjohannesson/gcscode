<script lang="ts">
  import { onMount } from 'svelte';

  import { liveSession } from './live-session.svelte';
  import { StreamHealthMonitor } from './stream-health-monitor.svelte';

  const monitor = new StreamHealthMonitor(() => liveSession.current);

  onMount(() => {
    monitor.start();
    return () => monitor.stop();
  });

  const dash = '—';
  const health = $derived(monitor.health);
  const rows = $derived([
    ['Connection', health.connection === 'none' ? 'no connection' : health.connection],
    [
      'Frames per second',
      health.framesPerSecond === null ? dash : health.framesPerSecond.toFixed(1),
    ],
    [
      'Since last new frame',
      health.sinceLastFrameMs === null ? dash : `${(health.sinceLastFrameMs / 1000).toFixed(1)} s`,
    ],
    ['Bitrate', health.bitrateKbps === null ? dash : `${Math.round(health.bitrateKbps)} kbit/s`],
    [
      'Packet loss',
      health.packetLossPercent === null ? dash : `${health.packetLossPercent.toFixed(1)} %`,
    ],
  ]);
</script>

<dl class="health">
  {#each rows as [label, value] (label)}
    <dt>{label}</dt>
    <dd data-testid={label}>{value}</dd>
  {/each}
</dl>

<style>
  .health {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
    padding: 0.75rem;
    font-variant-numeric: tabular-nums;
  }
  dt {
    color: #666;
  }
  dd {
    margin: 0;
  }
</style>
