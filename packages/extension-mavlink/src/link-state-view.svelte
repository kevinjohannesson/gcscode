<script lang="ts">
  import { onMount } from 'svelte';

  import { linkState, type BridgeState } from './link-state.svelte';
  import { STATION_PROTOCOL, stationLink, type StationStatus } from './station-link.svelte';

  /** How often the ages are redrawn: often enough that a 1 Hz heartbeat visibly resets. */
  const REDRAW_MS = 250;

  let now = $state(Date.now());

  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, REDRAW_MS);
    return () => clearInterval(timer);
  });

  const BRIDGE_LABEL: Record<BridgeState, string> = {
    connecting: 'connecting',
    connected: 'up',
    disconnected: 'down',
  };

  const STATION_LABEL: Record<StationStatus, string> = {
    connecting: 'connecting',
    running: 'running',
    'not-running': 'not running',
    mismatch: 'not usable',
  };

  const stationText = $derived(
    `${STATION_LABEL[stationLink.status]} for ${seconds(now - stationLink.since)}` +
      (stationLink.status === 'running' && stationLink.version
        ? ` (gcscode-station ${stationLink.version})`
        : ''),
  );

  function seconds(ms: number): string {
    return `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
  }
</script>

<section class="link">
  <dl>
    <dt>mavlink2rest</dt>
    <dd data-testid="bridge" class={linkState.bridge}>
      {BRIDGE_LABEL[linkState.bridge]} for {seconds(now - linkState.bridgeSince)}
    </dd>
    <dt>station</dt>
    <dd data-testid="station" class={stationLink.status}>
      {stationText}
    </dd>
  </dl>
  {#if stationLink.status === 'not-running'}
    <p data-testid="station-hint">
      Nothing answers at {stationLink.url}; this view keeps trying. <code>pnpm dev:sitl</code>
      starts the station, or <code>pnpm --filter mavlink-station start</code> alone. If it is running,
      it may have refused this page: its terminal says so.
    </p>
  {:else if stationLink.status === 'mismatch'}
    <p data-testid="station-hint">
      The station at {stationLink.url} speaks protocol {stationLink.stationProtocol}, this page
      protocol {STATION_PROTOCOL}. Run the two from the same checkout.
    </p>
  {/if}
  {#if linkState.bridge === 'disconnected'}
    <p data-testid="no-reconnect">
      gcscode does not reconnect after a drop yet. Reload the page once mavlink2rest is back.
    </p>
  {/if}

  {#if linkState.systems.length === 0}
    <p data-testid="no-systems">No heartbeat heard yet.</p>
  {:else}
    <table>
      <thead>
        <tr><th>System ID</th><th>Type</th><th>Last heartbeat</th></tr>
      </thead>
      <tbody>
        {#each linkState.systems as system (system.systemId)}
          <tr data-testid="system-{system.systemId}">
            <td>{system.systemId}</td>
            <td>{system.type ?? '—'}</td>
            <td data-testid="age-{system.systemId}">{seconds(now - system.at)} ago</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</section>

<style>
  .link {
    padding: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: #ddd;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
    margin: 0;
  }
  /* Light on the shell's dark panels, matching the Video health view. */
  dt,
  th {
    color: #999;
    font-weight: normal;
  }
  dd {
    margin: 0;
  }
  dd.disconnected,
  dd.not-running,
  dd.mismatch {
    color: #f88;
  }
  p {
    margin: 0.5rem 0 0;
    color: #999;
  }
  table {
    margin-top: 0.75rem;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: left;
    padding: 0.15rem 1rem 0.15rem 0;
  }
</style>
