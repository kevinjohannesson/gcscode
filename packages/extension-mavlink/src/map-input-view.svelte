<script lang="ts">
  import { onMount } from 'svelte';

  import { vehicleInputs, type InputSource, type Reading } from './vehicle-inputs.svelte';

  /** How often the ages redraw: often enough that a quiet vehicle shows within a second. */
  const TICK_MS = 250;

  let now = $state(Date.now());

  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, TICK_MS);
    return () => clearInterval(timer);
  });

  const dash = '—';

  function age(at: number): string {
    return `${(Math.max(0, now - at) / 1000).toFixed(1)} s`;
  }
  function coord(n: number): string {
    return n.toFixed(7);
  }
  function source(s: InputSource): string {
    return `${s.message} from ${s.systemId}/${s.componentId ?? '?'}`;
  }

  interface Line {
    label: string;
    reading: Reading<unknown> | null;
    text: string;
  }

  const vehicles = $derived(
    vehicleInputs.vehicles.map((v) => ({
      systemId: v.systemId,
      lastHeardAt: v.lastHeardAt,
      lines: [
        {
          label: 'Position',
          reading: v.position,
          text:
            v.position === null
              ? dash
              : `${coord(v.position.value.lat)}, ${coord(v.position.value.lng)}` +
                (v.position.value.alt === null ? '' : `, ${v.position.value.alt.toFixed(2)} m`),
        },
        {
          label: 'Heading',
          reading: v.heading,
          text: v.heading === null ? dash : `${v.heading.value.toFixed(2)}°`,
        },
        {
          label: 'Home',
          reading: v.home,
          text: v.home === null ? dash : `${coord(v.home.value.lat)}, ${coord(v.home.value.lng)}`,
        },
      ] satisfies Line[],
    })),
  );
  const writer = $derived(vehicleInputs.mergedWriter);
</script>

<section class="map-input">
  <p class="merged" data-testid="merged">
    {#if writer === null}
      The map has no position yet.
    {:else}
      The map draws one merged telemetry: system {writer.systemId}'s position, {age(writer.at)} ago.
    {/if}
  </p>

  {#if vehicles.length === 0}
    <p class="empty">No vehicle has sent a position or a home yet.</p>
  {:else}
    <table>
      <thead>
        <tr>
          <th scope="col"></th>
          <th scope="col">Value</th>
          <th scope="col">Received</th>
          <th scope="col">Changed</th>
          <th scope="col">Source</th>
        </tr>
      </thead>
      {#each vehicles as vehicle (vehicle.systemId)}
        <tbody data-testid="vehicle-{vehicle.systemId}">
          <tr class="vehicle">
            <th scope="rowgroup" colspan="5">
              Vehicle {vehicle.systemId}
              <span class="heard" data-testid="heard-{vehicle.systemId}"
                >last heard {age(vehicle.lastHeardAt)} ago</span
              >
            </th>
          </tr>
          {#each vehicle.lines as line (line.label)}
            <tr data-testid="{line.label}-{vehicle.systemId}">
              <th scope="row">{line.label}</th>
              <td>{line.text}</td>
              <td>{line.reading === null ? dash : age(line.reading.receivedAt)}</td>
              <td>{line.reading === null ? dash : age(line.reading.changedAt)}</td>
              <td>{line.reading === null ? 'not reported' : source(line.reading.source)}</td>
            </tr>
          {/each}
        </tbody>
      {/each}
    </table>
  {/if}
</section>

<style>
  .map-input {
    padding: 0.75rem;
    color: #ddd;
    font-variant-numeric: tabular-nums;
  }
  p {
    margin: 0 0 0.75rem;
  }
  /* Light on the shell's dark panels, matching the other proof views. */
  .empty,
  .heard,
  thead th {
    color: #999;
  }
  table {
    border-collapse: collapse;
  }
  th,
  td {
    padding: 0.15rem 0.75rem 0.15rem 0;
    text-align: left;
    white-space: nowrap;
    font-weight: normal;
  }
  tr.vehicle th {
    padding-top: 0.6rem;
    font-weight: 600;
  }
  .heard {
    margin-left: 0.5rem;
    font-weight: normal;
  }
</style>
