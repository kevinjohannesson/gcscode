<script lang="ts">
  import { onMount } from 'svelte';

  import { axisFill, buttonRows, eventsLine, isEdgeTx, pressedLine, usbId } from './radio-format';
  import { RadioInputState } from './radio-input-state.svelte';
  import { getStationAddress } from './station-address';
  import { PROTOCOL } from './station-protocol';

  const address = getStationAddress();
  const station = new RadioInputState(address, (url) => new WebSocket(url));

  onMount(() => {
    station.start();
    return () => station.stop();
  });

  const radio = $derived(station.radio);
</script>

<div class="view">
  {#if station.status === 'connecting'}
    <p class="message">Connecting to the station at {address}…</p>
  {:else if station.status === 'unreachable'}
    <p class="message">
      No station at {address}. Start it with <code>pnpm --filter mavlink-station start</code>; this
      view keeps trying.
    </p>
  {:else if station.status === 'mismatch'}
    <p class="message">
      The station speaks protocol {station.stationProtocol}, this page protocol {PROTOCOL}. Run the
      two from the same checkout.
    </p>
  {:else if !radio}
    <p class="message">
      The station has no radio open. Plug in the radio and choose USB Joystick (HID).
    </p>
  {:else}
    <p class="radio">
      {radio.name}
      {usbId(radio.vendorId, radio.productId)}
      {isEdgeTx(radio.vendorId, radio.productId) ? '(EdgeTX radio)' : ''}
    </p>
    <p class="detail">
      {#if radio.serial}serial {radio.serial} ·
      {/if}axes {radio.axes.length} · buttons {radio.buttons.length} · hats {radio.hats.length}
    </p>

    <table class="axes">
      <thead>
        <tr><th>axis</th><th>value</th><th class="scale">-32768 · 0 · 32767</th></tr>
      </thead>
      <tbody>
        {#each radio.axes as value, i (i)}
          {@const fill = axisFill(value)}
          <tr>
            <td class="num">{i}</td>
            <td class="num">{value}</td>
            <td class="bar">
              <span class="fill" style:left="{fill.left}%" style:width="{fill.width}%"></span>
              <span class="mid"></span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <p class="caption">buttons, highlighted when pressed:</p>
    <table class="buttons">
      <tbody>
        {#each buttonRows(radio.buttons.length) as row, r (r)}
          <tr>
            {#each row as n (n)}
              <td class:pressed={radio.buttons[n]} aria-pressed={radio.buttons[n]}>{n}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="pressed">{pressedLine(radio.buttons)}</p>

    {#if radio.hats.length}
      <p>hats {radio.hats.map((h, i) => `${i}:${h}`).join('  ')}</p>
    {/if}
  {/if}

  {#if station.status === 'live'}
    <p class="events">{eventsLine(station.eventsPerSecond)}</p>
  {/if}
</div>

<style>
  .view {
    height: 100%;
    overflow: auto;
    padding: 0.75rem 1rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85rem;
    color: #ddd;
    background: #1e1e1e;
    box-sizing: border-box;
  }
  p {
    margin: 0 0 0.5rem;
  }
  .detail,
  .caption,
  .events {
    color: #999;
  }
  table {
    border-collapse: collapse;
    margin-bottom: 0.5rem;
  }
  th,
  td {
    border: 1px solid #555;
    padding: 0.1rem 0.5rem;
  }
  th {
    font-weight: normal;
    color: #999;
  }
  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .scale {
    min-width: 16rem;
  }
  .bar {
    position: relative;
    min-width: 16rem;
  }
  .fill {
    position: absolute;
    top: 25%;
    bottom: 25%;
    background: #4fa3e0;
  }
  .mid {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    border-left: 1px solid #777;
  }
  .buttons td {
    width: 2.25rem;
    text-align: right;
  }
  .buttons td.pressed {
    background: #ddd;
    color: #1e1e1e;
  }
</style>
